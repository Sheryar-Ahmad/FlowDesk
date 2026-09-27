import assert from "node:assert/strict"
import { test } from "node:test"
import { Schema } from "@tiptap/pm/model"
import { EditorState } from "@tiptap/pm/state"
import { moduleLoader } from "./load-typescript.mjs"

const { replaceNoteText } = moduleLoader()("src/pages/notes/replaceNoteText.ts")
const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" }, paragraph: { content: "inline*" },
    text: { group: "inline" }, image: { inline: true, group: "inline", attrs: { src: {} } },
  },
  marks: { strong: {} },
})

test("replace all preserves marks and image URLs and treats replacement as plain text", () => {
  const state = EditorState.create({ doc: schema.node("doc", null, [schema.node("paragraph", null, [
    schema.text("cat cat", [schema.mark("strong")]),
    schema.node("image", { src: "https://example.test/cat.png" }),
    schema.text(" cat"),
  ])]) })
  const transaction = replaceNoteText(state, "cat", "<dog>")
  const doc = state.apply(transaction).doc
  assert.equal(doc.textContent, "<dog> <dog> <dog>")
  assert.equal(doc.firstChild.firstChild.marks[0].type.name, "strong")
  assert.equal(doc.firstChild.child(1).attrs.src, "https://example.test/cat.png")
})

test("empty and unmatched searches do not create a document change", () => {
  const state = EditorState.create({ schema })
  assert.equal(replaceNoteText(state, "", "x"), null)
  assert.equal(replaceNoteText(state, "missing", "x"), null)
})
