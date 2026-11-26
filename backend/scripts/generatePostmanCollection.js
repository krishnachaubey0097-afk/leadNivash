import fs from 'fs';
import path from 'path';

const collection = {
  info: {
    name: 'LeadNivesh API (Category-Wise Complete Suite)',
    description: 'Complete category-wise collection for LeadNivesh Broker Platform with pre-filled request bodies, bearer auth tokens, and automated login token saving.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
  },
  variable: [
    { key: 'baseUrl', value: 'https://leadnivash.onrender.com', type: 'string' },
    { key: 'accessToken', value: '', type: 'string' },
    { key: 'propertyId', value: '', type: 'string' },
    { key: 'buyerId', value: '', type: 'string' },
    { key: 'dealId', value: '', type: 'string' },
    { key: 'aliasId', value: '', type: 'string' },
    { key: 'sessionId', value: '', type: 'string' },
    { key: 'shareToken', value: '', type: 'string' }
  ],
  item: [
    // 00. Health & Platform Probes
    {
      name: '00 - Health & Probes',
      item: [
        {
          name: 'Root Welcome Info',
          request: {
            method: 'GET',
            header: [],
            url: { raw: '{{baseUrl}}/' },
            description: 'Returns API root welcome, status, version and resource endpoints.'
          }
        },
        {
          name: 'Liveness Probe (Health)',
          request: {
            method: 'GET',
            header: [],
            url: { raw: '{{baseUrl}}/health' },
            description: 'Checks if the Node.js API process is up and running.'
          }
        },
        {
          name: 'Readiness Probe (Ready)',
          request: {
            method: 'GET',
            header: [],
            url: { raw: '{{baseUrl}}/ready' },
            description: 'Checks if database connectivity (MongoDB Atlas) is ready.'
          }
        },
        {
          name: 'API v1 Info',
          request: {
            method: 'GET',
            header: [],
            url: { raw: '{{baseUrl}}/api/v1' },
            description: 'Returns API metadata and version.'
          }
        }
      ]
    },

    // 01. Authentication
    {
      name: '01 - Authentication & Sessions',
      item: [
        {
          name: 'Get Auth Providers',
          request: {
            method: 'GET',
            header: [],
            url: { raw: '{{baseUrl}}/api/v1/auth/providers' },
            description: 'Returns active Google OAuth & Email OTP provider capability flags.'
          }
        },
        {
          name: 'Google OAuth Sign-In / Sign-Up',
          request: {
            method: 'POST',
            header: [{ key: 'Content-Type', value: 'application/json' }],
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                accessToken: 'GOOGLE_OAUTH_ACCESS_TOKEN',
                phone: '+919876543210',
                agencyName: 'Sharma Realty',
                city: 'Panipat'
              }, null, 2),
              options: { raw: { language: 'json' } }
            },
            url: { raw: '{{baseUrl}}/api/v1/auth/google' },
            description: 'Verifies Google token against Google APIs, links/creates user in MongoDB, and issues session tokens.'
          }
        },
        {
          name: 'Send Email OTP',
          request: {
            method: 'POST',
            header: [{ key: 'Content-Type', value: 'application/json' }],
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                email: 'broker@leadnivesh.com',
                purpose: 'login'
              }, null, 2),
              options: { raw: { language: 'json' } }
            },
            url: { raw: '{{baseUrl}}/api/v1/auth/send-otp' },
            description: 'Generates 6-digit OTP stored hashed in MongoDB (10m TTL) and dispatches email.'
          }
        },
        {
          name: 'Verify Email OTP',
          request: {
            method: 'POST',
            header: [{ key: 'Content-Type', value: 'application/json' }],
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                email: 'broker@leadnivesh.com',
                otp: '123456',
                purpose: 'login'
              }, null, 2),
              options: { raw: { language: 'json' } }
            },
            url: { raw: '{{baseUrl}}/api/v1/auth/verify-otp' },
            description: 'Verifies OTP against MongoDB and returns JWT access token + HttpOnly refresh cookie.'
          }
        },
        {
          name: 'Login (Auto-saves accessToken)',
          event: [
            {
              listen: 'test',
              script: {
                type: 'text/javascript',
                exec: [
                  'var jsonData = pm.response.json();',
                  'if (jsonData.success && jsonData.data && jsonData.data.accessToken) {',
                  '    pm.collectionVariables.set("accessToken", jsonData.data.accessToken);',
                  '    console.log("accessToken successfully saved to collection variable!");',
                  '}'
                ]
              }
            }
          ],
          request: {
            method: 'POST',
            header: [{ key: 'Content-Type', value: 'application/json' }],
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                email: 'broker@leadnivesh.com',
                password: 'Broker@123456'
              }, null, 2),
              options: { raw: { language: 'json' } }
            },
            url: { raw: '{{baseUrl}}/api/v1/auth/login' },
            description: 'Authenticates broker and automatically sets {{accessToken}} collection variable.'
          }
        },
        {
          name: 'Login as SuperAdmin',
          event: [
            {
              listen: 'test',
              script: {
                type: 'text/javascript',
                exec: [
                  'var jsonData = pm.response.json();',
                  'if (jsonData.success && jsonData.data && jsonData.data.accessToken) {',
                  '    pm.collectionVariables.set("accessToken", jsonData.data.accessToken);',
                  '    console.log("Admin accessToken saved!");',
                  '}'
                ]
              }
            }
          ],
          request: {
            method: 'POST',
            header: [{ key: 'Content-Type', value: 'application/json' }],
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                email: 'admin@leadnivesh.com',
                password: 'Admin@123456'
              }, null, 2),
              options: { raw: { language: 'json' } }
            },
            url: { raw: '{{baseUrl}}/api/v1/auth/login' }
          }
        },
        {
          name: 'Register New Broker',
          request: {
            method: 'POST',
            header: [{ key: 'Content-Type', value: 'application/json' }],
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                name: 'Anil Mehra',
                email: 'anil.broker@example.com',
                password: 'Password@1234',
                phone: '+919812345678',
                agency: {
                  name: 'Mehra Real Estate',
                  city: 'Panipat',
                  reraNo: 'HRERA-PKL-2024-099'
                },
                consent: {
                  termsAccepted: true,
                  privacyVersion: '1.0'
                }
              }, null, 2),
              options: { raw: { language: 'json' } }
            },
            url: { raw: '{{baseUrl}}/api/v1/auth/register' }
          }
        },
        {
          name: 'Refresh Access Token',
          request: {
            method: 'POST',
            header: [{ key: 'Content-Type', value: 'application/json' }],
            url: { raw: '{{baseUrl}}/api/v1/auth/refresh' },
            description: 'Uses httpOnly refreshToken cookie to issue new accessToken.'
          }
        },
        {
          name: 'Logout',
          request: {
            method: 'POST',
            header: [{ key: 'Content-Type', value: 'application/json' }],
            url: { raw: '{{baseUrl}}/api/v1/auth/logout' },
            description: 'Clears refresh session cookie.'
          }
        },
        {
          name: 'Forgot Password',
          request: {
            method: 'POST',
            header: [{ key: 'Content-Type', value: 'application/json' }],
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                email: 'broker@leadnivesh.com'
              }, null, 2),
              options: { raw: { language: 'json' } }
            },
            url: { raw: '{{baseUrl}}/api/v1/auth/forgot-password' }
          }
        },
        {
          name: 'Reset Password',
          request: {
            method: 'POST',
            header: [{ key: 'Content-Type', value: 'application/json' }],
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                token: 'RESET_TOKEN_FROM_EMAIL',
                password: 'NewBrokerPassword@123'
              }, null, 2),
              options: { raw: { language: 'json' } }
            },
            url: { raw: '{{baseUrl}}/api/v1/auth/reset-password' }
          }
        },
        {
          name: 'List Active Sessions',
          request: {
            method: 'GET',
            header: [
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            url: { raw: '{{baseUrl}}/api/v1/auth/sessions' }
          }
        },
        {
          name: 'Revoke Session by ID',
          request: {
            method: 'DELETE',
            header: [
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            url: { raw: '{{baseUrl}}/api/v1/auth/sessions/{{sessionId}}' }
          }
        }
      ]
    },

    // 02. Properties
    {
      name: '02 - Properties',
      item: [
        {
          name: 'Create Property (Listing)',
          event: [
            {
              listen: 'test',
              script: {
                type: 'text/javascript',
                exec: [
                  'var jsonData = pm.response.json();',
                  'if (jsonData.success && jsonData.data && jsonData.data._id) {',
                  '    pm.collectionVariables.set("propertyId", jsonData.data._id);',
                  '    console.log("propertyId saved:", jsonData.data._id);',
                  '}'
                ]
              }
            }
          ],
          request: {
            method: 'POST',
            header: [
              { key: 'Content-Type', value: 'application/json' },
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                title: '250 Gaj Prime Corner Plot Sector 12',
                type: 'Plot',
                category: 'Residential',
                purpose: 'Sale',
                locality: 'Sector 12',
                city: 'Panipat',
                landmark: 'Near Mini Secretariat',
                size: {
                  value: 250,
                  unit: 'gaj'
                },
                priceDemandPaise: 1500000000,
                facing: 'North-East',
                tags: ['Corner', 'Wide Road', 'Park Facing'],
                description: 'Super prime 250 gaj corner residential plot with 45 ft wide road, clear title and immediate registry.',
                owner: {
                  name: 'Rajesh Gupta',
                  phone: '+919876500000',
                  notes: 'Direct owner, negotiation possible on token.'
                },
                status: 'available',
                source: 'manual'
              }, null, 2),
              options: { raw: { language: 'json' } }
            },
            url: { raw: '{{baseUrl}}/api/v1/properties' }
          }
        },
        {
          name: 'List Properties (Filter & Pagination)',
          request: {
            method: 'GET',
            header: [
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            url: { raw: '{{baseUrl}}/api/v1/properties?status=available&city=Panipat&page=1&limit=10' }
          }
        },
        {
          name: 'Get Property by ID',
          request: {
            method: 'GET',
            header: [
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            url: { raw: '{{baseUrl}}/api/v1/properties/{{propertyId}}' }
          }
        },
        {
          name: 'Update Property',
          request: {
            method: 'PATCH',
            header: [
              { key: 'Content-Type', value: 'application/json' },
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                priceDemandPaise: 1450000000,
                tags: ['Corner', 'Wide Road', 'Price Reduced']
              }, null, 2),
              options: { raw: { language: 'json' } }
            },
            url: { raw: '{{baseUrl}}/api/v1/properties/{{propertyId}}' }
          }
        },
        {
          name: 'Update Property Status',
          request: {
            method: 'PATCH',
            header: [
              { key: 'Content-Type', value: 'application/json' },
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                status: 'hold'
              }, null, 2),
              options: { raw: { language: 'json' } }
            },
            url: { raw: '{{baseUrl}}/api/v1/properties/{{propertyId}}/status' }
          }
        },
        {
          name: 'Create Property Share Link (Public Flyer)',
          event: [
            {
              listen: 'test',
              script: {
                type: 'text/javascript',
                exec: [
                  'var jsonData = pm.response.json();',
                  'if (jsonData.success && jsonData.data && jsonData.data.token) {',
                  '    pm.collectionVariables.set("shareToken", jsonData.data.token);',
                  '    console.log("shareToken saved:", jsonData.data.token);',
                  '}'
                ]
              }
            }
          ],
          request: {
            method: 'POST',
            header: [
              { key: 'Content-Type', value: 'application/json' },
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                template: 'flyer'
              }, null, 2),
              options: { raw: { language: 'json' } }
            },
            url: { raw: '{{baseUrl}}/api/v1/properties/{{propertyId}}/share' }
          }
        },
        {
          name: 'Get Matching Buyers for Property',
          request: {
            method: 'GET',
            header: [
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            url: { raw: '{{baseUrl}}/api/v1/properties/{{propertyId}}/matches' }
          }
        },
        {
          name: 'Sign Cloudinary Photo Upload',
          request: {
            method: 'POST',
            header: [
              { key: 'Content-Type', value: 'application/json' },
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            url: { raw: '{{baseUrl}}/api/v1/properties/photos/sign' }
          }
        },
        {
          name: 'Delete Property (Move to Trash)',
          request: {
            method: 'DELETE',
            header: [
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            url: { raw: '{{baseUrl}}/api/v1/properties/{{propertyId}}' }
          }
        }
      ]
    },

    // 03. Buyers
    {
      name: '03 - Buyers & Requirements',
      item: [
        {
          name: 'Create Buyer Requirement',
          event: [
            {
              listen: 'test',
              script: {
                type: 'text/javascript',
                exec: [
                  'var jsonData = pm.response.json();',
                  'if (jsonData.success && jsonData.data && jsonData.data._id) {',
                  '    pm.collectionVariables.set("buyerId", jsonData.data._id);',
                  '    console.log("buyerId saved:", jsonData.data._id);',
                  '}'
                ]
              }
            }
          ],
          request: {
            method: 'POST',
            header: [
              { key: 'Content-Type', value: 'application/json' },
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                name: 'Karan Singhal',
                phone: '+919811223344',
                localities: [
                  { display: 'Sector 12', key: 'sector-12' },
                  { display: 'Sector 11', key: 'sector-11' }
                ],
                anyLocality: false,
                types: ['Plot', 'Kothi'],
                purpose: 'Sale',
                budget: {
                  minPaise: 1000000000,
                  maxPaise: 1600000000
                },
                sizeGaj: {
                  min: 200,
                  max: 300
                },
                urgency: 'hot',
                status: 'active',
                notes: 'Serious cash buyer looking for immediate registry in Sector 11 or 12 Panipat.',
                source: 'manual'
              }, null, 2),
              options: { raw: { language: 'json' } }
            },
            url: { raw: '{{baseUrl}}/api/v1/buyers' }
          }
        },
        {
          name: 'List Buyers',
          request: {
            method: 'GET',
            header: [
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            url: { raw: '{{baseUrl}}/api/v1/buyers?status=active&urgency=hot&page=1&limit=10' }
          }
        },
        {
          name: 'Get Buyer by ID',
          request: {
            method: 'GET',
            header: [
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            url: { raw: '{{baseUrl}}/api/v1/buyers/{{buyerId}}' }
          }
        },
        {
          name: 'Update Buyer',
          request: {
            method: 'PATCH',
            header: [
              { key: 'Content-Type', value: 'application/json' },
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                urgency: 'hot',
                notes: 'Updated: Raised budget up to 1.7 Cr.'
              }, null, 2),
              options: { raw: { language: 'json' } }
            },
            url: { raw: '{{baseUrl}}/api/v1/buyers/{{buyerId}}' }
          }
        },
        {
          name: 'Get Matching Properties for Buyer',
          request: {
            method: 'GET',
            header: [
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            url: { raw: '{{baseUrl}}/api/v1/buyers/{{buyerId}}/matches' }
          }
        },
        {
          name: 'Delete Buyer (Move to Trash)',
          request: {
            method: 'DELETE',
            header: [
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            url: { raw: '{{baseUrl}}/api/v1/buyers/{{buyerId}}' }
          }
        }
      ]
    },

    // 04. Matches
    {
      name: '04 - Match Engine',
      item: [
        {
          name: 'Quick Match (Property vs Buyer)',
          request: {
            method: 'POST',
            header: [
              { key: 'Content-Type', value: 'application/json' },
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                property: {
                  type: 'Plot',
                  purpose: 'Sale',
                  localityKey: 'sector-12',
                  priceDemandPaise: 1500000000,
                  sizeGaj: 250
                },
                buyer: {
                  purpose: 'Sale',
                  types: ['Plot'],
                  localities: [{ display: 'Sector 12', key: 'sector-12' }],
                  budget: {
                    minPaise: 1200000000,
                    maxPaise: 1600000000
                  },
                  sizeGaj: {
                    min: 200,
                    max: 300
                  }
                },
                tolerancePct: 10
              }, null, 2),
              options: { raw: { language: 'json' } }
            },
            url: { raw: '{{baseUrl}}/api/v1/matches/quick' }
          }
        }
      ]
    },

    // 05. Deals & Commission
    {
      name: '05 - Deals & Commission',
      item: [
        {
          name: 'Create Deal',
          event: [
            {
              listen: 'test',
              script: {
                type: 'text/javascript',
                exec: [
                  'var jsonData = pm.response.json();',
                  'if (jsonData.success && jsonData.data && jsonData.data._id) {',
                  '    pm.collectionVariables.set("dealId", jsonData.data._id);',
                  '    console.log("dealId saved:", jsonData.data._id);',
                  '}'
                ]
              }
            }
          ],
          request: {
            method: 'POST',
            header: [
              { key: 'Content-Type', value: 'application/json' },
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                buyerId: '{{buyerId}}',
                propertyId: '{{propertyId}}',
                propertyTitleSnapshot: '250 Gaj Prime Corner Plot Sector 12',
                valuePaise: 1450000000,
                commission: {
                  mode: 'percent',
                  bps: 100
                },
                stage: 'interested',
                notes: 'Deal initiated following successful site visit.'
              }, null, 2),
              options: { raw: { language: 'json' } }
            },
            url: { raw: '{{baseUrl}}/api/v1/deals' }
          }
        },
        {
          name: 'List Deals',
          request: {
            method: 'GET',
            header: [
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            url: { raw: '{{baseUrl}}/api/v1/deals?stage=interested' }
          }
        },
        {
          name: 'Get Deals Pipeline Summary',
          request: {
            method: 'GET',
            header: [
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            url: { raw: '{{baseUrl}}/api/v1/deals/summary' }
          }
        },
        {
          name: 'Get Deal by ID',
          request: {
            method: 'GET',
            header: [
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            url: { raw: '{{baseUrl}}/api/v1/deals/{{dealId}}' }
          }
        },
        {
          name: 'Update Deal Stage',
          request: {
            method: 'PATCH',
            header: [
              { key: 'Content-Type', value: 'application/json' },
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                stage: 'negotiating'
              }, null, 2),
              options: { raw: { language: 'json' } }
            },
            url: { raw: '{{baseUrl}}/api/v1/deals/{{dealId}}/stage' }
          }
        },
        {
          name: 'Record Deal Commission Payment',
          request: {
            method: 'POST',
            header: [
              { key: 'Content-Type', value: 'application/json' },
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                amountPaise: 5000000,
                note: 'Token advance commission received via NEFT',
                receivedAt: new Date().toISOString()
              }, null, 2),
              options: { raw: { language: 'json' } }
            },
            url: { raw: '{{baseUrl}}/api/v1/deals/{{dealId}}/payments' }
          }
        },
        {
          name: 'Delete Deal (Move to Trash)',
          request: {
            method: 'DELETE',
            header: [
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            url: { raw: '{{baseUrl}}/api/v1/deals/{{dealId}}' }
          }
        }
      ]
    },

    // 06. AI Parser
    {
      name: '06 - AI Parsing Engine (WhatsApp / Raw Text)',
      item: [
        {
          name: 'Parse Unstructured WhatsApp Text',
          request: {
            method: 'POST',
            header: [
              { key: 'Content-Type', value: 'application/json' },
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                rawText: 'Urgent requirement: Need 250 gaj residential plot in Sector 12 Panipat, budget 1.5 Cr, client ready with payment.'
              }, null, 2),
              options: { raw: { language: 'json' } }
            },
            url: { raw: '{{baseUrl}}/api/v1/parse' }
          }
        },
        {
          name: 'Commit Parsed Entity to Database',
          request: {
            method: 'POST',
            header: [
              { key: 'Content-Type', value: 'application/json' },
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                parseId: 'PARSE_RESULT_ID',
                type: 'buyer',
                overrides: {
                  urgency: 'hot'
                }
              }, null, 2),
              options: { raw: { language: 'json' } }
            },
            url: { raw: '{{baseUrl}}/api/v1/parse/commit' }
          }
        }
      ]
    },

    // 07. Dashboard
    {
      name: '07 - Dashboard',
      item: [
        {
          name: 'Get Today Dashboard Metrics',
          request: {
            method: 'GET',
            header: [
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            url: { raw: '{{baseUrl}}/api/v1/dashboard/today' }
          }
        }
      ]
    },

    // 08. Aliases
    {
      name: '08 - Locality Aliases',
      item: [
        {
          name: 'List Locality Aliases',
          request: {
            method: 'GET',
            header: [
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            url: { raw: '{{baseUrl}}/api/v1/aliases?city=Panipat' }
          }
        },
        {
          name: 'Create Custom Locality Alias',
          event: [
            {
              listen: 'test',
              script: {
                type: 'text/javascript',
                exec: [
                  'var jsonData = pm.response.json();',
                  'if (jsonData.success && jsonData.data && jsonData.data._id) {',
                  '    pm.collectionVariables.set("aliasId", jsonData.data._id);',
                  '}'
                ]
              }
            }
          ],
          request: {
            method: 'POST',
            header: [
              { key: 'Content-Type', value: 'application/json' },
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                canonical: 'Sector 18 HUDA',
                aliases: ['s18 huda', 'sec 18 huda', 'sector 18 huda ground'],
                city: 'Panipat'
              }, null, 2),
              options: { raw: { language: 'json' } }
            },
            url: { raw: '{{baseUrl}}/api/v1/aliases' }
          }
        },
        {
          name: 'Delete Locality Alias',
          request: {
            method: 'DELETE',
            header: [
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            url: { raw: '{{baseUrl}}/api/v1/aliases/{{aliasId}}' }
          }
        }
      ]
    },

    // 09. User Profile
    {
      name: '09 - User Profile & Settings',
      item: [
        {
          name: 'Get Current Profile (Me)',
          request: {
            method: 'GET',
            header: [
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            url: { raw: '{{baseUrl}}/api/v1/users/me' }
          }
        },
        {
          name: 'Update Current Profile',
          request: {
            method: 'PATCH',
            header: [
              { key: 'Content-Type', value: 'application/json' },
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                name: 'Vikram Malhotra',
                phone: '+919876543210',
                agency: {
                  name: 'Malhotra Real Estate & Associates',
                  city: 'Panipat',
                  reraNo: 'HRERA-PKL-PNP-2023-089'
                },
                preferences: {
                  language: 'en',
                  budgetTolerancePct: 15,
                  marlaToGaj: 30.25,
                  defaultCity: 'Panipat'
                }
              }, null, 2),
              options: { raw: { language: 'json' } }
            },
            url: { raw: '{{baseUrl}}/api/v1/users/me' }
          }
        },
        {
          name: 'Sign Agency Logo Upload',
          request: {
            method: 'POST',
            header: [
              { key: 'Content-Type', value: 'application/json' },
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            url: { raw: '{{baseUrl}}/api/v1/users/me/logo/sign' }
          }
        },
        {
          name: 'Export My Account Data',
          request: {
            method: 'GET',
            header: [
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            url: { raw: '{{baseUrl}}/api/v1/users/me/export' }
          }
        }
      ]
    },

    // 10. Public Endpoints & Inquiries
    {
      name: '10 - Public Endpoints & Inquiries',
      item: [
        {
          name: 'View Public Property Flyer HTML',
          request: {
            method: 'GET',
            header: [],
            url: { raw: '{{baseUrl}}/p/{{shareToken}}' }
          }
        },
        {
          name: 'Submit Public Inquiry on Shared Flyer',
          request: {
            method: 'POST',
            header: [{ key: 'Content-Type', value: 'application/json' }],
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                propertyId: '{{propertyId}}',
                name: 'Sunil Kumar',
                phone: '+919812999888',
                message: 'Is this corner plot still available? When can I inspect the site?'
              }, null, 2),
              options: { raw: { language: 'json' } }
            },
            url: { raw: '{{baseUrl}}/api/v1/public/inquiries' }
          }
        },
        {
          name: 'List Broker Received Inquiries',
          request: {
            method: 'GET',
            header: [
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            url: { raw: '{{baseUrl}}/api/v1/inquiries' }
          }
        },
        {
          name: 'Submit Platform Contact Lead',
          request: {
            method: 'POST',
            header: [{ key: 'Content-Type', value: 'application/json' }],
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                name: 'Rohan Verma',
                email: 'rohan.verma@example.com',
                phone: '+919988776655',
                message: 'Interested in getting a Pro account subscription for our 5-agent team.'
              }, null, 2),
              options: { raw: { language: 'json' } }
            },
            url: { raw: '{{baseUrl}}/api/v1/public/contact' }
          }
        },
        {
          name: 'Get Public Lead Form Broker Profile',
          request: {
            method: 'GET',
            url: { raw: '{{baseUrl}}/api/v1/public/lead-form/{{brokerId}}' }
          }
        },
        {
          name: 'Submit Shared Lead Form (Buyer / Seller)',
          request: {
            method: 'POST',
            header: [
              { key: 'Content-Type', value: 'application/json' }
            ],
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                category: 'buyer',
                name: 'Karan Malhotra',
                phone: '+919812770011',
                email: 'karan@example.com',
                purpose: 'Sale',
                budgetPaise: 1200000000,
                isApproxBudget: true,
                types: ['Floor', 'Flat'],
                localities: ['Model Town', 'Sector 18'],
                city: 'Panipat',
                urgency: 'hot',
                notes: 'Need 3 BHK park facing builder floor.'
              }, null, 2),
              options: { raw: { language: 'json' } }
            },
            url: { raw: '{{baseUrl}}/api/v1/public/lead-form/{{brokerId}}' }
          }
        },
        {
          name: 'List Broker Lead Form Submissions',
          request: {
            method: 'GET',
            header: [
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            url: { raw: '{{baseUrl}}/api/v1/lead-form/submissions' }
          }
        },
        {
          name: 'Revoke Share Link',
          request: {
            method: 'DELETE',
            header: [
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            url: { raw: '{{baseUrl}}/api/v1/shares/{{shareToken}}' }
          }
        }
      ]
    },

    // 11. Trash & Recovery
    {
      name: '11 - Trash & Recovery',
      item: [
        {
          name: 'List Trashed Items',
          request: {
            method: 'GET',
            header: [
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            url: { raw: '{{baseUrl}}/api/v1/trash' }
          }
        },
        {
          name: 'Restore Trashed Property',
          request: {
            method: 'POST',
            header: [
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            url: { raw: '{{baseUrl}}/api/v1/trash/property/{{propertyId}}/restore' }
          }
        },
        {
          name: 'Restore Trashed Buyer',
          request: {
            method: 'POST',
            header: [
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            url: { raw: '{{baseUrl}}/api/v1/trash/buyer/{{buyerId}}/restore' }
          }
        },
        {
          name: 'Permanently Delete Trashed Property',
          request: {
            method: 'DELETE',
            header: [
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            url: { raw: '{{baseUrl}}/api/v1/trash/property/{{propertyId}}' }
          }
        }
      ]
    },

    // 12. SuperAdmin
    {
      name: '12 - Admin Management',
      item: [
        {
          name: 'List All Platform Users',
          request: {
            method: 'GET',
            header: [
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            url: { raw: '{{baseUrl}}/api/v1/admin/users?page=1&limit=20' }
          }
        },
        {
          name: 'Update User Plan Tier',
          request: {
            method: 'PATCH',
            header: [
              { key: 'Content-Type', value: 'application/json' },
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            body: {
              mode: 'raw',
              raw: JSON.stringify({
                tier: 'pro'
              }, null, 2),
              options: { raw: { language: 'json' } }
            },
            url: { raw: '{{baseUrl}}/api/v1/admin/users/{{buyerId}}/plan' }
          }
        },
        {
          name: 'Get Platform Usage & Telemetry',
          request: {
            method: 'GET',
            header: [
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            url: { raw: '{{baseUrl}}/api/v1/admin/usage' }
          }
        },
        {
          name: 'List Platform Inquiries',
          request: {
            method: 'GET',
            header: [
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            url: { raw: '{{baseUrl}}/api/v1/admin/inquiries' }
          }
        },
        {
          name: 'List Contact Leads',
          request: {
            method: 'GET',
            header: [
              { key: 'Authorization', value: 'Bearer {{accessToken}}' }
            ],
            url: { raw: '{{baseUrl}}/api/v1/admin/contacts' }
          }
        }
      ]
    }
  ]
};

const outputPath = path.resolve('leadnivesh.postman_collection.json');
fs.writeFileSync(outputPath, JSON.stringify(collection, null, 2), 'utf-8');
console.log('✅ Generated collection file at:', outputPath);
