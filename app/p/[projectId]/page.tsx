import { LayoutApp } from "@/app/components/layout/layout-app"
import { ProjectView } from "@/app/p/[projectId]/project-view"

type Props = {
  params: Promise<{ projectId: string }>
}

export default async function Page({ params }: Props) {
  const { projectId } = await params

  return (
    <LayoutApp>
      <ProjectView projectId={projectId} key={projectId} />
    </LayoutApp>
  )
}
