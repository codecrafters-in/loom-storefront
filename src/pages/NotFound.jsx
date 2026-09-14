import { Button, Empty } from '../components/ui/index.jsx'
import Seo from '../components/Seo.jsx'
import { t } from '../i18n/index.js'

export default function NotFound() {
  return (
    <>
      <Seo title={t('Not found')} noindex />
      <Empty
      icon="search"
      title={t('That page does not exist')}
      body={t('It may have moved, or the link may be wrong.')}
      action={
        <div className="flex flex-wrap justify-center gap-3">
          <Button to="/" size="lg">{t('Go home')}</Button>
          <Button to="/shop" variant="outline" size="lg">{t('Shop everything')}</Button>
        </div>
      }
      className="min-h-[60vh]"
      />
    </>
  )
}
