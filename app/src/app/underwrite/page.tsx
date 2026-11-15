import { redirect } from "next/navigation";

// old address, kept so shared links still work
export default function Page() {
  redirect("/earn");
}
