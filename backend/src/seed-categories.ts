import { prisma } from "./config/db";

async function main() {
  const categories = [
    { name: "Music", slug: "music" },
    { name: "Food", slug: "food" },
    { name: "Tech", slug: "tech" },
    { name: "Wellness", slug: "wellness" },
    { name: "Art", slug: "art" },
    { name: "Sports", slug: "sports" }
  ];

  console.log("Seeding categories...");
  for (const cat of categories) {
    const upserted = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name },
      create: { name: cat.name, slug: cat.slug }
    });
    console.log(`Upserted category: ${upserted.name} (${upserted.id})`);
  }
  console.log("Seeding complete!");
}

main()
  .catch((e) => {
    console.error("Error seeding categories:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
