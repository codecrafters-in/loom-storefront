import { Button, Empty } from '../components/ui/index.jsx'

export default function NotFound() {
  return (
    <Empty
      icon="search"
      title="That page does not exist"
      body="It may have moved, or the link may be wrong."
      action={
        <div className="flex flex-wrap justify-center gap-3">
          <Button to="/" size="lg">Go home</Button>
          <Button to="/shop" variant="outline" size="lg">Shop everything</Button>
        </div>
      }
      className="min-h-[60vh]"
    />
  )
}
