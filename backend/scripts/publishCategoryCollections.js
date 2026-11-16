import fs from 'fs';

const WORKSPACE_ID = '9e692ab1-88a8-4e7a-aa95-c3edfff5dd5f'; // Lead Nivash workspace

export async function publishCategories(apiKey) {
  if (!apiKey || !apiKey.startsWith('PMAK-')) {
    console.error('❌ Error: Valid Postman API Key starting with PMAK- is required.');
    process.exit(1);
  }

  const raw = fs.readFileSync('f:/Work/leadnivash/backend/leadnivesh.postman_collection.json', 'utf-8');
  const fullCollection = JSON.parse(raw);

  console.log(`🚀 Found ${fullCollection.item.length} categories. Publishing each as a separate collection into workspace ${WORKSPACE_ID}...`);

  for (const category of fullCollection.item) {
    const singleCollection = {
      info: {
        name: `LeadNivesh - ${category.name}`,
        description: `LeadNivesh endpoints for ${category.name}`,
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
      },
      variable: fullCollection.variable,
      item: category.item
    };

    console.log(`Publishing [${category.name}]...`);
    const res = await fetch(`https://api.postman.com/collections?workspace=${WORKSPACE_ID}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey
      },
      body: JSON.stringify({ collection: singleCollection })
    });

    const data = await res.json();
    if (res.ok) {
      console.log(`✅ [${category.name}] live in Postman! (UID: ${data.collection?.uid})`);
    } else {
      console.error(`❌ Failed [${category.name}]:`, data.error?.message || data);
    }
    // Sleep 500ms to stay well within Postman rate limits
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('🎉 All categories published live to Postman!');
}

if (process.argv[2]) {
  publishCategories(process.argv[2]);
}
