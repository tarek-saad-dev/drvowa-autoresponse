import { redirect } from "next/navigation";

/** Legacy deep links now open the teaching tab inside the employee studio. */
export default function KnowledgePage() {
  redirect("/dashboard/agent?tab=knowledge");
}
