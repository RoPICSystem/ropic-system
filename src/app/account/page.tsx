import { redirect } from "next/navigation";

export default function Account() {
  redirect("/account/signin");
  
  return null;
}