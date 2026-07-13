// prisma/seed.ts
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

async function main() {
  const seedPath = path.join(__dirname, "..", "company-seed.json");
  const raw = fs.readFileSync(seedPath, "utf-8");
  const companies = JSON.parse(raw);

  // Map JSON fields to Prisma model fields with slug generation
  const [editingValue, setEditingValue] = useState('');
  // Dashboard password protection
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const DASHBOARD_PASSWORD = 'dashboard2026';
  if (!isAuthenticated) {
    return (
      <div className="password-container" style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100vh',background:'var(--bg)'}}>
        <h2>Enter Dashboard Password</h2>
        <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" style={{margin:'0.5rem',padding:'0.5rem'}} />
        <button className="btn btn-primary" onClick={()=>{
          if (password===DASHBOARD_PASSWORD) { setIsAuthenticated(true); setAuthError(''); } else { setAuthError('Incorrect password'); }
        }}>Enter</button>
        {authError && <p style={{color:'var(--error-text)'}}>{authError}</p>}
      </div>
    );
  }
  const slugify = (str:string)=>str.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
  const data = companies.map((c:any)=>({
    name: c.name,
    slug: slugify(c.name),
    sector: c.sector ?? "",
    websiteUrl: c.website_url ?? null,
    linkedinUrl: c.linkedin_url ?? null,
  }));

  // Use createMany with skipDuplicates (based on unique slug or name if made unique later)
  const result = await prisma.company.createMany({
    data,
    skipDuplicates: true,
  });
  console.log(`✅ Seeded ${result.count} companies`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

