import { CreateLeagueForm } from "@/components/league-forms";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Create a league" };

export default function NewLeague() {
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Create a league" subtitle="Private and invitation-only. You'll be the commissioner." />
      <CreateLeagueForm />
    </div>
  );
}
