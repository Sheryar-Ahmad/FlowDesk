import axios from "axios"
import { useAuthStore } from "../../store/authStore"

const api = axios.create({ baseURL: "http://localhost:8000/api/v1", timeout: 10000 })
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export interface Note {
  id: string
  title: string
  content: any
  content_text: string
  word_count: number
  created_at: string
  updated_at: string
}

export const getNotes = async (params?: any) => (await api.get("/notes/", { params })).data
export const getNote = async (id: string) => (await api.get(`/notes/${id}`)).data
export const createNote = async (data: any) => (await api.post("/notes/", data)).data
export const updateNote = async (id: string, data: any) => (await api.put(`/notes/${id}`, data)).data
export const deleteNote = async (id: string) => (await api.delete(`/notes/${id}`)).data
