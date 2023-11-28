import { useEffect } from 'react'
import { useRouter } from 'next/router'

const Index = () => {
  const router = useRouter()
  const REALM = 'jjCAwuuNpJCNMLAanpwgJZ6cdXzLPXe2GfD6TaDQBXt'

  useEffect(() => {
    const mainUrl = REALM ? `/dao/${REALM}` : '/realms'
    if (!router.asPath.includes(mainUrl)) {
      router.replace(mainUrl)
    }
  }, [REALM])

  return null
}

export default Index
