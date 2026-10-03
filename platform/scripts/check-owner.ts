import { PrismaClient } from "@prisma/client";
async function main() {
  const db = new PrismaClient();
  const u = await db.user.findFirst({ where: { email: "owner@demo.test" }, select: { passwordHash: true, email: true } });
  if (u) console.log("User:", u.email, "hash:", u.passwordHash?.substring(0, 30));
  else console.log("NO_USER");
  await db.$disconnect();
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
