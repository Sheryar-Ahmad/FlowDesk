import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import axios from "axios"
import { moduleLoader, sourcePath } from "./load-typescript.mjs"

const session = {
  accessToken: "access", refreshToken: "refresh",
  user: { id: "user-1", email: "test@example.test", display_name: "Test", plan: "free", email_verified: true },
}
const originalWindow = globalThis.window
afterEach(() => {
  if (originalWindow === undefined) delete globalThis.window
  else globalThis.window = originalWindow
})

function browser() {
  const storage = new Map()
  const redirects = []
  globalThis.window = {
    sessionStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
    location: { pathname: "/dashboard", assign: url => redirects.push(url) },
  }
  return redirects
}

function httpError(status, config = {}) {
  return new axios.AxiosError("Request failed", status ? "ERR_BAD_RESPONSE" : "ERR_NETWORK", config,
    undefined, status ? { status, data: {}, headers: {}, config } : undefined)
}

function authFixture(getCurrentUser) {
  browser()
  const load = moduleLoader({
    [sourcePath("src/services/api/auth.api.ts")]: {
      getCurrentUser,
      getAuthErrorMessage: () => "Server unavailable",
      logoutUser: async () => {},
    },
  })
  const storage = load("src/services/api/authSession.ts")
  storage.writeAuthSession(session)
  const store = load("src/store/authStore.ts").useAuthStore
  return { storage, store }
}

for (const status of [undefined, 429, 503]) {
  test(`session initialization preserves credentials during temporary error ${status ?? "offline"}`, async () => {
    const { storage, store } = authFixture(async () => { throw httpError(status) })
    await store.getState().initializeSession()
    assert.deepEqual(storage.readAuthSession(), session)
    assert.equal(store.getState().isAuthenticated, true)
    assert.equal(store.getState().isInitialized, true)
    assert.equal(store.getState().isLoading, false)
  })
}

test("payment plan refresh survives a server error and then updates to Pro", async () => {
  let fail = false
  const { storage, store } = authFixture(async () => {
    if (fail) throw httpError(503)
    return { user: { ...session.user, plan: "pro" } }
  })
  await store.getState().initializeSession()
  fail = true
  await assert.rejects(store.getState().refreshUser())
  assert.equal(store.getState().isAuthenticated, true)
  assert.ok(storage.readAuthSession())
  fail = false
  await store.getState().refreshUser()
  assert.equal(store.getState().user.plan, "pro")
})

test("rejected account refresh clears the session", async () => {
  const { storage, store } = authFixture(async () => { throw httpError(401) })
  await assert.rejects(store.getState().refreshUser())
  assert.equal(storage.readAuthSession(), null)
  assert.equal(store.getState().isAuthenticated, false)
})

test("late account response cannot sign the user back in after logout", async () => {
  let finish
  const { storage, store } = authFixture(() => new Promise(resolve => { finish = resolve }))
  const pending = store.getState().refreshUser()
  await store.getState().logout()
  finish({ user: session.user })
  await pending
  assert.equal(storage.readAuthSession(), null)
  assert.equal(store.getState().isAuthenticated, false)
})

function clientFixture(adapter) {
  const redirects = browser()
  const load = moduleLoader({
    axios: { ...axios, create: config => axios.create({ ...config, adapter }) },
    [sourcePath("src/services/api/config.ts")]: { API_BASE_URL: "https://example.test/api/v1" },
  })
  const storage = load("src/services/api/authSession.ts")
  storage.writeAuthSession(session)
  return { storage, redirects, client: load("src/services/api/client.ts").default }
}

for (const status of [undefined, 429, 503, 401]) {
  test(`token refresh handles ${status ?? "offline"} without mistaking an outage for logout`, async () => {
    const { storage, redirects, client } = clientFixture(async config => {
      throw httpError(config.url === "/auth/refresh" ? status : 401, config)
    })
    await assert.rejects(client.get("/auth/me"))
    assert.equal(Boolean(storage.readAuthSession()), status !== 401)
    assert.equal(redirects.length, status === 401 ? 1 : 0)
  })
}

test("token refresh retries with the new access token", async () => {
  let refreshed = false
  const { storage, client } = clientFixture(async config => {
    if (config.url === "/auth/refresh") {
      refreshed = true
      return { status: 200, config, data: { access_token: "new-access", refresh_token: "new-refresh", user: session.user } }
    }
    if (!refreshed) throw httpError(401, config)
    assert.equal(config.headers.Authorization, "Bearer new-access")
    return { status: 200, config, data: { user: session.user } }
  })
  await client.get("/auth/me")
  assert.equal(storage.readAuthSession().refreshToken, "new-refresh")
})

test("in-flight token refresh cannot recreate a cleared session", async () => {
  let finishRefresh
  let started
  const refreshing = new Promise(resolve => { started = resolve })
  const { storage, client } = clientFixture(async config => {
    if (config.url !== "/auth/refresh") throw httpError(401, config)
    started()
    return new Promise(resolve => { finishRefresh = () => resolve({
      status: 200, config, data: { access_token: "new-access", refresh_token: "new-refresh", user: session.user },
    }) })
  })
  const pending = client.get("/auth/me")
  await refreshing
  storage.clearAuthSession()
  finishRefresh()
  await assert.rejects(pending)
  assert.equal(storage.readAuthSession(), null)
})
