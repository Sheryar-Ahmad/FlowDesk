import axios from "axios"
import { useAuthStore } from "../../store/authStore"

const api = axios.create({ baseURL: "http://localhost:8000/api/v1", timeout: 10000 })
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export interface Project { id: string; name: string; description?: string; color: string; is_archived: boolean; created_at: string }
export interface Column { id: string; project_id: string; name: string; position: number; color: string }
export interface Task { id: string; project_id: string; title: string; description?: string; status: string; priority: string; due_date?: string; position: number; labels: string[]; created_at: string; completed_at?: string }

export const getProjects = async () => (await api.get("/tasks/projects")).data
export const createProject = async (data: any) => (await api.post("/tasks/projects", data)).data
export const updateProject = async (id: string, data: any) => (await api.put(`/tasks/projects/${id}`, data)).data
export const deleteProject = async (id: string) => (await api.delete(`/tasks/projects/${id}`)).data
export const getColumns = async (projectId: string) => (await api.get(`/tasks/projects/${projectId}/columns`)).data
export const createColumn = async (projectId: string, name: string) => (await api.post(`/tasks/projects/${projectId}/columns`, { name })).data
export const getTasks = async (projectId: string) => (await api.get(`/tasks/projects/${projectId}/tasks`)).data
export const createTask = async (projectId: string, data: any) => (await api.post(`/tasks/projects/${projectId}/tasks`, data)).data
export const updateTask = async (taskId: string, data: any) => (await api.put(`/tasks/tasks/${taskId}`, data)).data
export const deleteTask = async (taskId: string) => (await api.delete(`/tasks/tasks/${taskId}`)).data
