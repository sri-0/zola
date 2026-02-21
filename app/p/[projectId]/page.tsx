import { LayoutApp } from "@/app/components/layout/layout-app"
import { ProjectView } from "@/app/p/[projectId]/project-view"

export default function Page() {
  return (
    <LayoutApp>
      <ProjectView />
    </LayoutApp>
  )
}
