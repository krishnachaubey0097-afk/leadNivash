import fs from 'fs';
import path from 'path';

const WORKSPACE_ID = '9e692ab1-88a8-4e7a-aa95-c3edfff5dd5f'; // Lead Nivash workspace

export async function publishCollections(apiKey) {
  if (!apiKey || !apiKey.startsWith('PMAK-')) {
    console.error('❌ Error: Valid Postman API Key starting with PMAK- is required.');
    process.exit(1);
  }

  const raw = fs.readFileSync('f:/Work/leadnivash/backend/leadnivesh.postman_collection.json', 'utf-8');
  const fullCollection = JSON.parse(raw);

  console.log(`🚀 Publishing master collection to workspace: ${WORKSPACE_ID}...`);
  
  const res = await fetch(`https://api.postman.com/collections?workspace=${WORKSPACE_ID}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey
    },
    body: JSON.stringify({
      collection: fullCollection
    })
  });

  const data = await res.json();
  if (res.ok) {
    console.log('✅ Master Collection successfully published to Postman Cloud!');
    console.log('Collection ID:', data.collection?.id);
    console.log('Collection UID:', data.collection?.uid);
    console.log('Collection Name:', data.collection?.name);
  } else {
    console.error('❌ Failed to publish collection:', JSON.stringify(data, null, 2));
  }
}

if (process.argv[2]) {
  publishCollections(process.argv[2]);
}
