import { useEffect } from 'react'
import { useRouter } from 'next/router'

const Index = () => {
  const router = useRouter()
  const REALM = process?.env?.REALM

  useEffect(() => {
    // Redirect to the jito page
    const mainUrl = REALM ? `/dao/${REALM}` : '/realms'
    if (!router.asPath.includes(mainUrl)) {
      router.replace(mainUrl)
    }
    // This doesn't need to be here
  }, [REALM])

  return null
}

export default Index
