import {prisma} from "@/lib/prisma"
import {authOptions} from "@/app/api/auth/[...nextauth]/route";
import {getServerSession } from "next-auth"
import {User} from "@/app/user";

export default async function Home() {
  const session = await getServerSession(authOptions)

  return (
    <main>
          <h2>Server Session</h2>
          <pre>{JSON.stringify(session)}</pre>
          <h2>Client Call</h2>
          <User />
    </main>
  )

}