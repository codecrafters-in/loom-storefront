import Section from '../components/home/sections.jsx'
import Seo from '../components/Seo.jsx'
import { useStorefront } from '../store/StorefrontContext.jsx'

/**
 * There is no home page layout in this file, on purpose.
 *
 * The page is `storefront.home` — an ordered list of typed sections from the
 * API — so a merchant reorders, retitles or removes anything on it without a
 * deploy. See src/components/home/sections.jsx for the type registry.
 */
export default function Home() {
  const { home = [] } = useStorefront()
  return (
    <>
      <Seo />
      {home.map((section, i) => (
        <Section key={`${section.type}-${i}`} section={section} />
      ))}
    </>
  )
}
