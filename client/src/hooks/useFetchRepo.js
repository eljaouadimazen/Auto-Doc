import { useState, useCallback } from 'react'

export function useFetchRepo() {
  const [githubUrl, setGithubUrl] = useState('')
  const [fetchedFiles, setFetchedFiles] = useState(null)
  const [repoName, setRepoName] = useState('')
  const [rawMarkdown, setRawMarkdown] = useState('')
  const [auditSummary, setAuditSummary] = useState(null)
  const [targetRepo, setTargetRepo] = useState('')

  const resetRepo = useCallback(() => {
    setFetchedFiles(null)
    setRepoName('')
    setRawMarkdown('')
    setAuditSummary(null)
    setTargetRepo('')
  }, [])

  return {
    githubUrl, setGithubUrl,
    fetchedFiles, setFetchedFiles,
    repoName, setRepoName,
    rawMarkdown, setRawMarkdown,
    auditSummary, setAuditSummary,
    targetRepo, setTargetRepo,
    resetRepo,
  }
}
