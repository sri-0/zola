import { LayoutApp } from "@/app/components/layout/layout-app"
import { ProjectView } from "@/app/p/[projectId]/project-view"
import { isSupabaseEnabled } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

type Props = {
  params: Promise<{ projectId: string }>
}

export default async function Page({ params }: Props) {
  const { projectId } = await params

  if (isSupabaseEnabled) {
    const supabase = await createClient()
    if (supabase) {
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError || !userData?.user) {
        redirect("/")
      }

      // Verify the project belongs to the user
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .eq("user_id", userData.user.id)
        .single()

      if (projectError || !project) {
        redirect("/")
      }
    }
  }

  return (
    <LayoutApp>
      <ProjectView projectId={projectId} key={projectId} />
    </LayoutApp>
  )
}
