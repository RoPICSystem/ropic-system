import { redirect } from "next/navigation";

export default function Account() {
  redirect("/account/login");
  
  return null;
}