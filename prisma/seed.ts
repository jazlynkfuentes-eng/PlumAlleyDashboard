import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type SeedCompany = {
  slug: string;
  name: string;
  sector: string;
  description: string;
  websiteUrl: string | null;
  linkedinUrl: string | null;
  newsFeedUrl: string | null;
};

const companies: SeedCompany[] = [
  {
    slug: "aclima",
    name: "Aclima",
    sector: "Climate / Air Quality",
    description: "Hyperlocal air quality and environmental intelligence.",
    websiteUrl: "https://www.aclima.io/",
    linkedinUrl: "https://www.linkedin.com/company/aclima/",
    newsFeedUrl: "https://www.aclima.io/blog",
  },
  {
    slug: "aifi",
    name: "AiFi",
    sector: "Retail Tech / AI",
    description: "Autonomous shopping and computer vision for retail spaces.",
    websiteUrl: "https://aifi.com/",
    linkedinUrl: "https://www.linkedin.com/company/aifi-inc/",
    newsFeedUrl: "https://aifi.com/news/",
  },
  {
    slug: "air-protein",
    name: "Air Protein",
    sector: "Food Tech",
    description: "Protein made from air using proprietary fermentation.",
    websiteUrl: "https://www.airprotein.com/",
    linkedinUrl: "https://www.linkedin.com/company/air-protein/",
    newsFeedUrl: "https://www.airprotein.com/news",
  },
  {
    slug: "apellai",
    name: "Apellai",
    sector: "Health Tech",
    description: "Predictive screening infrastructure.",
    websiteUrl: "https://www.apellai.com/",
    linkedinUrl: null,
    newsFeedUrl: "https://www.apellai.com/",
  },
  {
    slug: "arix-technologies",
    name: "ARIX Technologies",
    sector: "Robotics / Industrial",
    description: "Robotic inspection for corrosion under insulation.",
    websiteUrl: "https://arixtechnologies.com/",
    linkedinUrl: "https://www.linkedin.com/company/arix-technologies/",
    newsFeedUrl: "https://arixtechnologies.com/news/",
  },
  {
    slug: "ashvattha-therapeutics",
    name: "Ashvattha Therapeutics",
    sector: "Biotech",
    description: "Intracellular targeted therapeutics.",
    websiteUrl: "https://avttx.com/",
    linkedinUrl: "https://www.linkedin.com/company/ashvattha-therapeutics/",
    newsFeedUrl: "https://avttx.com/news/",
  },
  {
    slug: "betteromics",
    name: "BetterOmics",
    sector: "Bioinformatics",
    description: "Omics data infrastructure and analytics.",
    websiteUrl: "https://www.betteromics.com/",
    linkedinUrl: "https://www.linkedin.com/company/betteromics/",
    newsFeedUrl: "https://www.betteromics.com/blog",
  },
  {
    slug: "biobot-analytics",
    name: "Biobot Analytics",
    sector: "Public Health",
    description: "Wastewater intelligence platform.",
    websiteUrl: "https://biobot.io/",
    linkedinUrl: "https://www.linkedin.com/company/biobot-analytics/",
    newsFeedUrl: "https://biobot.io/blog/",
  },
  {
    slug: "bioeclipse",
    name: "BioEclipse",
    sector: "Biotech / Immuno-oncology",
    description: "Next-generation immunotherapy.",
    websiteUrl: "https://www.bioeclipse.com/",
    linkedinUrl: "https://www.linkedin.com/company/bioeclipse-therapeutics/",
    newsFeedUrl: "https://www.bioeclipse.com/news/",
  },
  {
    slug: "cordex",
    name: "Cordex",
    sector: "Climate Science",
    description: "Coordinated regional climate downscaling.",
    websiteUrl: "https://cordex.org/",
    linkedinUrl: "https://www.linkedin.com/company/wcrp-cordex/",
    newsFeedUrl: "https://cordex.org/news/",
  },
  {
    slug: "diligent-robotics",
    name: "Diligent Robotics",
    sector: "Healthcare Robotics",
    description: "Hospital assistance robots for clinical workflows.",
    websiteUrl: "https://www.diligentrobots.com/",
    linkedinUrl: "https://www.linkedin.com/company/diligent-robotics/",
    newsFeedUrl: "https://www.diligentrobots.com/news",
  },
  {
    slug: "einride",
    name: "Einride",
    sector: "Mobility / Logistics",
    description: "Electric and autonomous freight movement.",
    websiteUrl: "https://www.einride.tech/",
    linkedinUrl: "https://www.linkedin.com/company/einride/",
    newsFeedUrl: "https://www.einride.tech/news",
  },
  {
    slug: "epibone",
    name: "EpiBone",
    sector: "Biotech / Regenerative",
    description: "Living bone and cartilage grown from patient cells.",
    websiteUrl: "https://www.epibone.com/",
    linkedinUrl: "https://www.linkedin.com/company/epibone/",
    newsFeedUrl: "https://www.epibone.com/news",
  },
  {
    slug: "evrnu",
    name: "Evrnu",
    sector: "Materials / Circularity",
    description: "Nucycl regenerated fiber from textile waste.",
    websiteUrl: "https://www.evrnu.com/",
    linkedinUrl: "https://www.linkedin.com/company/evrnu/",
    newsFeedUrl: "https://www.evrnu.com/news",
  },
  {
    slug: "gameto",
    name: "Gameto",
    sector: "Women's Health / Biotech",
    description: "Redefining fertility and women's health therapies.",
    websiteUrl: "https://www.gametogen.com/",
    linkedinUrl: "https://www.linkedin.com/company/gameto/",
    newsFeedUrl: "https://www.gametogen.com/news",
  },
  {
    slug: "grey-rhino",
    name: "Grey Rhino (One Concern)",
    sector: "Climate Risk / Software",
    description: "Planetary-scale resilience and disaster modeling.",
    websiteUrl: "https://www.oneconcern.com/",
    linkedinUrl: "https://www.linkedin.com/company/oneconcern/",
    newsFeedUrl: "https://www.oneconcern.com/news",
  },
  {
    slug: "helaina",
    name: "Helaina",
    sector: "Food Tech / Biotech",
    description: "Human-equivalent proteins via precision fermentation.",
    websiteUrl: "https://www.helaina.com/",
    linkedinUrl: "https://www.linkedin.com/company/helaina/",
    newsFeedUrl: "https://www.helaina.com/news",
  },
  {
    slug: "humans-and",
    name: "humans&",
    sector: "Consumer / Community",
    description: "Brand building human connection and belonging.",
    websiteUrl: "https://www.humansand.com/",
    linkedinUrl: "https://www.linkedin.com/company/humansand/",
    newsFeedUrl: "https://www.humansand.com/journal",
  },
  {
    slug: "innerplant",
    name: "InnerPlant",
    sector: "AgTech",
    description: "Living plant sensors for early stress detection.",
    websiteUrl: "https://innerplant.com/",
    linkedinUrl: "https://www.linkedin.com/company/innerplant/",
    newsFeedUrl: "https://innerplant.com/news/",
  },
  {
    slug: "juvena-therapeutics",
    name: "Juvena Therapeutics",
    sector: "Biotech",
    description: "Therapeutics from regenerative signaling proteins.",
    websiteUrl: "https://www.juvenatherapeutics.com/",
    linkedinUrl: "https://www.linkedin.com/company/juvena-therapeutics/",
    newsFeedUrl: "https://www.juvenatherapeutics.com/news",
  },
  {
    slug: "ketos",
    name: "KETOS",
    sector: "Water Tech",
    description: "Automated water quality monitoring.",
    websiteUrl: "https://www.ketos.co/",
    linkedinUrl: "https://www.linkedin.com/company/ketos/",
    newsFeedUrl: "https://www.ketos.co/blog",
  },
  {
    slug: "kraus-hamdani-aerospace",
    name: "Kraus Hamdani Aerospace",
    sector: "Aerospace / Defense",
    description: "Autonomous UAV systems for intel and communications.",
    websiteUrl: "https://www.kraushamdaniaero.com/",
    linkedinUrl: "https://www.linkedin.com/company/kraus-hamdani-aerospace/",
    newsFeedUrl: "https://www.kraushamdaniaero.com/news",
  },
  {
    slug: "mai",
    name: "MAI (formerly Markable)",
    sector: "Marketing / AI",
    description: "AI performance marketing agents.",
    websiteUrl: "https://www.mai.com/",
    linkedinUrl: "https://www.linkedin.com/company/mai-agents/",
    newsFeedUrl: "https://www.mai.com/blog",
  },
  {
    slug: "mammoth-biosciences",
    name: "Mammoth Biosciences",
    sector: "Biotech / CRISPR",
    description: "CRISPR-based diagnostics and therapeutics.",
    websiteUrl: "https://mammoth.bio/",
    linkedinUrl: "https://www.linkedin.com/company/mammoth-biosciences/",
    newsFeedUrl: "https://mammoth.bio/news/",
  },
  {
    slug: "node",
    name: "Node",
    sector: "Platform / Emerging Tech",
    description: "Portfolio company Node — official communications tracked via LinkedIn and website.",
    websiteUrl: "https://www.node.com/",
    linkedinUrl: "https://www.linkedin.com/company/node/",
    newsFeedUrl: "https://www.node.com/blog",
  },
  {
    slug: "fidocure",
    name: "FidoCure (One Health)",
    sector: "Veterinary Oncology",
    description: "Personalized medicine for canine cancer.",
    websiteUrl: "https://www.fidocure.com/",
    linkedinUrl: "https://www.linkedin.com/company/one-health-company/",
    newsFeedUrl: "https://www.fidocure.com/news",
  },
  {
    slug: "openwater",
    name: "Openwater",
    sector: "MedTech",
    description: "Wearable health and therapeutic ultrasound solutions.",
    websiteUrl: "https://www.openwater.health/",
    linkedinUrl: "https://www.linkedin.com/company/openwaterhealth/",
    newsFeedUrl: "https://www.openwater.health/news",
  },
  {
    slug: "phoenix-tailings",
    name: "Phoenix Tailings",
    sector: "Cleantech / Materials",
    description: "Rare earth refining and metal recovery in America.",
    websiteUrl: "https://www.phoenixtailings.com/",
    linkedinUrl: "https://www.linkedin.com/company/phoenix-tailings/",
    newsFeedUrl: "https://www.phoenixtailings.com/news",
  },
  {
    slug: "programmable-medicine",
    name: "Programmable Medicine LLC",
    sector: "Biotech",
    description: "Programmable medicine platform company.",
    websiteUrl: "https://www.programmablemedicine.com/",
    linkedinUrl: null,
    newsFeedUrl: "https://www.programmablemedicine.com/",
  },
  {
    slug: "siren-biotechnology",
    name: "Siren Biotechnology",
    sector: "Biotech / Gene Therapy",
    description: "Universal AAV immuno-gene therapy.",
    websiteUrl: "https://www.sirenbiotechnology.com/",
    linkedinUrl: "https://www.linkedin.com/company/siren-biotechnology/",
    newsFeedUrl: "https://www.sirenbiotechnology.com/news",
  },
  {
    slug: "thinkcerca",
    name: "ThinkCERCA",
    sector: "EdTech",
    description: "Personalized close reading and argumentative writing.",
    websiteUrl: "https://www.thinkcerca.com/",
    linkedinUrl: "https://www.linkedin.com/company/thinkcerca/",
    newsFeedUrl: "https://www.thinkcerca.com/blog",
  },
  {
    slug: "tinkergarten",
    name: "Tinkergarten",
    sector: "EdTech / Outdoor Learning",
    description: "Outdoor learning activities for kids.",
    websiteUrl: "https://www.tinkergarten.com/",
    linkedinUrl: "https://www.linkedin.com/company/tinkergarten/",
    newsFeedUrl: "https://www.tinkergarten.com/blog",
  },
  {
    slug: "vyv",
    name: "Vyv (formerly Vital Vio)",
    sector: "Lighting / Antimicrobial",
    description: "Antimicrobial LED lighting for home and industry.",
    websiteUrl: "https://www.vyv.tech/",
    linkedinUrl: "https://www.linkedin.com/company/vyv/",
    newsFeedUrl: "https://www.vyv.tech/news",
  },
];

async function main() {
  console.log(`Seeding ${companies.length} companies...`);

  for (const company of companies) {
    await prisma.company.upsert({
      where: { slug: company.slug },
      create: company,
      update: {
        name: company.name,
        sector: company.sector,
        description: company.description,
        websiteUrl: company.websiteUrl,
        linkedinUrl: company.linkedinUrl,
        newsFeedUrl: company.newsFeedUrl,
      },
    });
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
