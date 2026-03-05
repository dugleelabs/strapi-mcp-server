export interface StrapiEntry {
  id: number
  attributes: Record<string, unknown>
}

export interface StrapiListResponse {
  data: StrapiEntry[]
  meta: {
    pagination: {
      page: number
      pageSize: number
      pageCount: number
      total: number
    }
  }
}

export interface StrapiSingleResponse {
  data: StrapiEntry
  meta: Record<string, unknown>
}

export interface StrapiAttribute {
  type: string
  required?: boolean
  default?: unknown
  [key: string]: unknown
}

export interface StrapiContentType {
  uid: string
  apiID: string
  schema: {
    displayName: string
    singularName: string
    pluralName: string
    kind: 'collectionType' | 'singleType'
    attributes: Record<string, StrapiAttribute>
  }
}

export interface StrapiContentTypeListResponse {
  data: StrapiContentType[]
}

export interface StrapiError {
  status: number
  name: string
  message: string
  details?: unknown
}

export interface StrapiErrorResponse {
  error: StrapiError
}
