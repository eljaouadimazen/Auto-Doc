import { useState } from 'react'

export function usePublish() {
  const [githubPublishToken, setGithubPublishToken] = useState('')
  const [publishStatus, setPublishStatus] = useState(null)
  const [publishUrl, setPublishUrl] = useState('')
  const [publishError, setPublishError] = useState('')

  const resetPublish = () => {
    setPublishStatus(null)
    setPublishUrl('')
    setPublishError('')
  }

  return {
    githubPublishToken, setGithubPublishToken,
    publishStatus, setPublishStatus,
    publishUrl, setPublishUrl,
    publishError, setPublishError,
    resetPublish,
  }
}
