import { env } from "@/lib/env"
import type {
  BindProjectRepositoryRequest,
  ProjectBasicInfo,
  CreateProjectRequest,
  Project,
  ProjectDetailBundle,
  ProjectInvitation,
  ProjectMember,
  ProjectRepoActivity,
  ProjectRepository,
  ProjectRepositoryCandidate,
  RespondInvitationRequest,
  SearchedUser,
  UpdateProjectRequest,
  UserBasicInfo,
} from "./project-types"

const PREFIX = env.API_PREFIX
const API_BASE = env.API_URL || PREFIX

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const headers =
    options?.body instanceof FormData ? options.headers : { "Content-Type": "application/json", ...options?.headers }
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || err.message || `Request failed: ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

type ProjectsResponse = { projects: Project[] }
type ProjectResponse = { project: Project }
type MembersResponse = { members: ProjectMember[] }
type InvitationsResponse = { invitations: ProjectInvitation[] }
type RepositoriesResponse = { repositories: ProjectRepository[] }
type RepositoryCandidatesResponse = { repositories: ProjectRepositoryCandidate[] }
type SearchUsersResponse = { users: SearchedUser[] }
type InvitationResponse = { invitation: ProjectInvitation }
type UserBasicInfoResponse = { user: UserBasicInfo }
type ProjectBasicInfoResponse = { project: ProjectBasicInfo }

const userInfoCache = new Map<string, UserBasicInfo>()
const userInfoPending = new Map<string, Promise<UserBasicInfo>>()
const projectBasicInfoCache = new Map<string, ProjectBasicInfo>()
const projectBasicInfoPending = new Map<string, Promise<ProjectBasicInfo>>()

async function resolveUserInfo(userIds: string[]) {
  const unique = Array.from(new Set(userIds.filter(Boolean)))
  if (unique.length === 0) return {} as Record<string, UserBasicInfo>

  const entries = await Promise.all(
    unique.map(async (userId) => {
      const cached = userInfoCache.get(userId)
      if (cached) return [userId, cached] as const

      const pending = userInfoPending.get(userId)
      if (pending) return [userId, await pending] as const

      const request = apiFetch<UserBasicInfoResponse>(`/api/users/info?id=${encodeURIComponent(userId)}`)
        .then((res) => {
          const user = res.user ?? { id: userId, name: userId }
          userInfoCache.set(userId, user)
          userInfoPending.delete(userId)
          return user
        })
        .catch(() => {
          const fallback = { id: userId, name: userId } satisfies UserBasicInfo
          userInfoCache.set(userId, fallback)
          userInfoPending.delete(userId)
          return fallback
        })

      userInfoPending.set(userId, request)
      return [userId, await request] as const
    }),
  )

  return Object.fromEntries(entries)
}

async function resolveProjectBasicInfo(projectIds: string[]) {
  const unique = Array.from(new Set(projectIds.filter(Boolean)))
  if (unique.length === 0) return {} as Record<string, ProjectBasicInfo>

  const entries = await Promise.all(
    unique.map(async (projectId) => {
      const cached = projectBasicInfoCache.get(projectId)
      if (cached) return [projectId, cached] as const

      const pending = projectBasicInfoPending.get(projectId)
      if (pending) return [projectId, await pending] as const

      const request = apiFetch<ProjectBasicInfoResponse>(`/api/projects/${projectId}/basic`)
        .then((res) => {
          const project = res.project ?? { id: projectId, name: projectId }
          projectBasicInfoCache.set(projectId, project)
          projectBasicInfoPending.delete(projectId)
          return project
        })
        .catch(() => {
          const fallback = { id: projectId, name: projectId } satisfies ProjectBasicInfo
          projectBasicInfoCache.set(projectId, fallback)
          projectBasicInfoPending.delete(projectId)
          return fallback
        })

      projectBasicInfoPending.set(projectId, request)
      return [projectId, await request] as const
    }),
  )

  return Object.fromEntries(entries)
}

export const projectsApi = {
  async list(search?: string) {
    const res = await apiFetch<ProjectsResponse>("/api/projects")
    const details = res.projects ?? []
    const keyword = search?.trim().toLowerCase()
    if (!keyword) return details
    return details.filter(
      (project) =>
        project.name.toLowerCase().includes(keyword) ||
        (project.description ?? "").toLowerCase().includes(keyword) ||
        project.id.toLowerCase().includes(keyword),
    )
  },

  async get(projectId: string): Promise<ProjectDetailBundle | undefined> {
    const [projectRes, membersRes, invitationsRes, repositoriesRes, activityRes] = await Promise.all([
      apiFetch<ProjectResponse>(`/api/projects/${projectId}`),
      apiFetch<MembersResponse>(`/api/projects/${projectId}/members`),
      apiFetch<InvitationsResponse>(`/api/projects/${projectId}/invitations`).catch(() => ({ invitations: [] })),
      apiFetch<RepositoriesResponse>(`/api/projects/${projectId}/repositories`).catch(() => ({ repositories: [] })),
      apiFetch<ProjectRepoActivity>(`/api/projects/${projectId}/repo-activity?days=30&includeInactive=true`).catch(() => ({
        project: { id: projectId, name: projectResFallbackName(projectId) },
        range: { days: 30, from: "", to: "" },
        summary: {
          member_count: 0,
          repository_count: 0,
          active_member_count: 0,
          active_repository_count: 0,
          total_requests: 0,
        },
        members: [],
        repositories: [],
      })),
    ])

    const project = projectRes.project
    if (!project) return undefined

    const users = await resolveUserInfo([
      project.creatorId,
      ...membersRes.members.map((member) => member.userId),
      ...invitationsRes.invitations.flatMap((invitation) => [invitation.inviteeId, invitation.inviterId]),
      ...repositoriesRes.repositories.map((repository) => repository.boundByUserId),
      ...activityRes.members.map((member) => member.userId),
      ...activityRes.repositories.flatMap((repo) => repo.activeMembers.map((member) => member.userId)),
    ])

    return {
      project,
      members: membersRes.members,
      invitations: invitationsRes.invitations,
      repositories: repositoriesRes.repositories,
      activity: activityRes,
      users,
    }
  },

  searchUsers(query: string) {
    return apiFetch<SearchUsersResponse>(`/api/users/search?q=${encodeURIComponent(query)}`)
  },

  invite(projectId: string, payload: { inviteeId: string; role: "admin" | "member"; message?: string }) {
    return apiFetch<InvitationResponse>(`/api/projects/${projectId}/invitations`, {
      method: "POST",
      body: JSON.stringify(payload),
    })
  },

  create(payload: CreateProjectRequest) {
    return apiFetch<ProjectResponse>("/api/projects", {
      method: "POST",
      body: JSON.stringify(payload),
    })
  },

  update(projectId: string, payload: UpdateProjectRequest) {
    return apiFetch<ProjectResponse>(`/api/projects/${projectId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    })
  },

  updateArchiveTime(projectId: string, archivedAt: string) {
    return apiFetch<{ project: ProjectBasicInfo }>(`/api/projects/${projectId}/archive-time`, {
      method: "PUT",
      body: JSON.stringify({ archivedAt }),
    })
  },

  archive(projectId: string) {
    return apiFetch<ProjectResponse>(`/api/projects/${projectId}/archive`, {
      method: "POST",
    })
  },

  unarchive(projectId: string) {
    return apiFetch<ProjectResponse>(`/api/projects/${projectId}/unarchive`, {
      method: "POST",
    })
  },

  remove(projectId: string) {
    return apiFetch<void>(`/api/projects/${projectId}`, {
      method: "DELETE",
    })
  },

  bindRepository(projectId: string, payload: BindProjectRepositoryRequest) {
    return apiFetch<{ repository: ProjectRepository }>(`/api/projects/${projectId}/repositories`, {
      method: "POST",
      body: JSON.stringify(payload),
    })
  },

  unbindRepository(projectId: string, repoBindingId: string) {
    return apiFetch<void>(`/api/projects/${projectId}/repositories/${repoBindingId}`, {
      method: "DELETE",
    })
  },

  listRepositoryCandidates(projectId: string, days = 30) {
    return apiFetch<RepositoryCandidatesResponse>(`/api/projects/${projectId}/repository-candidates?days=${days}`)
  },

  listMyInvitations() {
    return apiFetch<InvitationsResponse>("/api/invitations")
  },

  respondInvitation(invitationId: string, payload: RespondInvitationRequest) {
    return apiFetch<InvitationsResponse>(`/api/invitations/${invitationId}/respond`, {
      method: "POST",
      body: JSON.stringify(payload),
    })
  },

  setPin(projectId: string, pinned: boolean) {
    return apiFetch<ProjectResponse>(`/api/projects/${projectId}/pin`, {
      method: "PUT",
      body: JSON.stringify({ pinned }),
    })
  },

  resolveUserInfo(userIds: string[]) {
    return resolveUserInfo(userIds)
  },

  resolveProjectBasicInfo(projectIds: string[]) {
    return resolveProjectBasicInfo(projectIds)
  },

  async resolveUserNames(userIds: string[]) {
    const users = await resolveUserInfo(userIds)
    return Object.fromEntries(Object.entries(users).map(([id, user]) => [id, user.name]))
  },
}

function projectResFallbackName(projectId: string) {
  return projectId
}
