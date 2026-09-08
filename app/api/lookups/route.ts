import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
// Must not prerender: the build has no database. Cached at the edge instead,
// which is what matters — the zone list is 845 rows and rarely changes.
export const dynamic = 'force-dynamic';

/** Feeds the dropdowns on the member form. Zones and business types carry
 *  their parent so the form can narrow them as the user picks. */
export async function GET() {
  const [areas, zones, categories, types] = await Promise.all([
    sql`select code, name from areas order by code`,
    sql`select id, name, area_code from zones order by id`,
    sql`select code, name from categories order by code`,
    sql`select code, name, category_code from business_types order by code`,
  ]);
  return NextResponse.json({ areas, zones, categories, types }, {
    headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' },
  });
}
