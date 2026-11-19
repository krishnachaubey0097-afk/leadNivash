import type { PublicPropertyDto } from '../properties/publicDto.js';
import type { IShareLink } from './shareLink.model.js';
import { formatPaiseToInr } from '../../utils/money.js';

function escapeHtml(str: string | undefined | null): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderFlyerHtml(property: PublicPropertyDto, share: IShareLink): string {
  const title = escapeHtml(property.title || 'Verified Property');
  const locality = escapeHtml(property.locality);
  const city = escapeHtml(property.city);
  const formattedPrice = property.priceDemandPaise ? formatPaiseToInr(property.priceDemandPaise) : 'Price on Request';
  const sizeText = `${property.sizeGaj} Gaj (${property.size?.value || property.sizeGaj} ${property.size?.unit || 'gaj'})`;
  const description = escapeHtml(property.description || `${property.type} available in ${locality}, ${city}. Excellent location and investment opportunity.`);
  const coverImage = property.photos && property.photos.length > 0 ? property.photos[0]?.url : 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800&q=80';

  const photosHtml =
    property.photos && property.photos.length > 0
      ? property.photos
          .map(
            (p, idx) => `
          <div class="photo-slide">
            <img src="${escapeHtml(p.url)}" alt="${title} photo ${idx + 1}" loading="lazy" />
          </div>
        `
          )
          .join('')
      : '';

  const videoUrl = property.videoUrl || property.video?.url;
  const videoHtml = videoUrl
    ? `
      <div style="margin-bottom: 16px; border-radius: 12px; overflow: hidden; background: #0f172a;">
        <video src="${escapeHtml(videoUrl)}" controls playsinline poster="${escapeHtml(coverImage)}" style="width: 100%; max-height: 420px; display: block; border-radius: 12px;">
          Your browser does not support the video tag.
        </video>
      </div>
    `
    : '';

  const tagsHtml = (property.tags || [])
    .map((tag) => `<span class="tag-badge">#${escapeHtml(tag)}</span>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${title} | LeadNivesh Verified</title>
  
  <!-- OpenGraph Metadata -->
  <meta property="og:title" content="${title} - ${formattedPrice}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${coverImage}" />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${coverImage}" />

  <style>
    :root {
      --primary: #1e3a8a;
      --primary-accent: #2563eb;
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --text: #0f172a;
      --text-muted: #64748b;
      --border: #e2e8f0;
      --success: #16a34a;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding-bottom: 60px;
    }
    .header-bar {
      background: var(--primary);
      color: #fff;
      padding: 14px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .brand { font-weight: 700; font-size: 1.15rem; letter-spacing: -0.02em; }
    .badge {
      background: rgba(255, 255, 255, 0.18);
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }
    .container {
      max-width: 640px;
      margin: 16px auto;
      padding: 0 16px;
    }
    .card {
      background: var(--card-bg);
      border-radius: 16px;
      border: 1px solid var(--border);
      overflow: hidden;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
    }
    .gallery {
      display: flex;
      overflow-x: auto;
      scroll-snap-type: x mandatory;
      background: #000;
      max-height: 380px;
    }
    .photo-slide {
      flex: 0 0 100%;
      scroll-snap-align: start;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .photo-slide img {
      width: 100%;
      height: 380px;
      object-fit: cover;
    }
    .details { padding: 20px; }
    .price-tag {
      font-size: 1.75rem;
      font-weight: 800;
      color: var(--success);
      margin-bottom: 4px;
    }
    .prop-title {
      font-size: 1.25rem;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .location-sub {
      color: var(--text-muted);
      font-size: 0.95rem;
      margin-bottom: 16px;
    }
    .specs-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      padding: 16px 0;
      border-top: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
      margin-bottom: 16px;
    }
    .spec-item {
      background: #f1f5f9;
      padding: 10px 14px;
      border-radius: 8px;
    }
    .spec-label { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; }
    .spec-value { font-size: 1rem; font-weight: 600; }
    .desc-box { margin-bottom: 20px; }
    .desc-title { font-size: 0.9rem; font-weight: 700; margin-bottom: 6px; }
    .desc-text { font-size: 0.95rem; color: #334155; white-space: pre-line; }
    .tags-container { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 24px; }
    .tag-badge { background: #e0f2fe; color: #0369a1; padding: 4px 8px; border-radius: 6px; font-size: 0.8rem; font-weight: 500; }
    
    .inquiry-card {
      background: #ffffff;
      border-radius: 16px;
      border: 1px solid var(--border);
      padding: 20px;
      margin-top: 16px;
    }
    .inquiry-title { font-size: 1.1rem; font-weight: 700; margin-bottom: 4px; }
    .inquiry-sub { font-size: 0.85rem; color: var(--text-muted); margin-bottom: 14px; }
    .form-group { margin-bottom: 12px; }
    .form-label { display: block; font-size: 0.8rem; font-weight: 600; margin-bottom: 4px; }
    .form-input, .form-textarea {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: 8px;
      font-size: 0.95rem;
    }
    .form-textarea { resize: vertical; min-height: 70px; }
    .hp-field { display: none !important; }
    .btn-submit {
      width: 100%;
      background: var(--primary-accent);
      color: #fff;
      padding: 12px;
      border-radius: 8px;
      border: none;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    .btn-submit:hover { background: var(--primary); }
    .notice { font-size: 0.75rem; color: var(--text-muted); text-align: center; margin-top: 10px; }
  </style>
</head>
<body>
  <header class="header-bar">
    <div class="brand">LeadNivesh Verified</div>
    <div class="badge">Direct Listing</div>
  </header>

  <div class="container">
    <div class="card">
      ${videoHtml}
      ${photosHtml ? `<div class="gallery">${photosHtml}</div>` : ''}
      <div class="details">
        <div class="price-tag">${formattedPrice}</div>
        <h1 class="prop-title">${title}</h1>
        <div class="location-sub">📍 ${locality}, ${city}</div>

        <div class="specs-grid">
          <div class="spec-item">
            <div class="spec-label">Plot / Land Size</div>
            <div class="spec-value">${sizeText}</div>
          </div>
          <div class="spec-item">
            <div class="spec-label">Property Type</div>
            <div class="spec-value">${escapeHtml(property.type)} (${escapeHtml(property.category)})</div>
          </div>
          <div class="spec-item">
            <div class="spec-label">Purpose</div>
            <div class="spec-value">For ${escapeHtml(property.purpose)}</div>
          </div>
          <div class="spec-item">
            <div class="spec-label">Facing</div>
            <div class="spec-value">${escapeHtml(property.facing || 'Open / Standard')}</div>
          </div>
        </div>

        <div class="desc-box">
          <div class="desc-title">Overview & Features</div>
          <div class="desc-text">${description}</div>
        </div>

        ${tagsHtml ? `<div class="tags-container">${tagsHtml}</div>` : ''}
      </div>
    </div>

    <!-- Contact & Inquiry Form -->
    <div class="inquiry-card">
      <div class="inquiry-title">Interested in this property?</div>
      <div class="inquiry-sub">Connect directly with the authorized broker. No spam guarantee.</div>

      <form id="inquiryForm" action="/api/v1/public/inquiries" method="POST">
        <input type="hidden" name="propertyId" value="${escapeHtml(property.id)}" />
        <input type="hidden" name="shareLinkId" value="${escapeHtml(share._id.toString())}" />
        
        <!-- Anti-Spam Honeypot Field -->
        <input type="text" name="website" class="hp-field" tabindex="-1" autocomplete="off" />

        <div class="form-group">
          <label class="form-label" for="inq_name">Your Name</label>
          <input class="form-input" type="text" id="inq_name" name="name" placeholder="Enter your full name" required />
        </div>

        <div class="form-group">
          <label class="form-label" for="inq_phone">WhatsApp / Mobile Number</label>
          <input class="form-input" type="tel" id="inq_phone" name="phone" placeholder="+91 98123 45678" required />
        </div>

        <div class="form-group">
          <label class="form-label" for="inq_message">Message (Optional)</label>
          <textarea class="form-textarea" id="inq_message" name="message" placeholder="I am interested in this listing. Please share location and inspection details."></textarea>
        </div>

        <button type="submit" class="btn-submit">Submit Inquiry</button>
        <div class="notice">Protected by LeadNivesh Privacy Guarantee. Your details are shared only with the listing broker.</div>
      </form>
    </div>
  </div>
</body>
</html>`;
}

export function renderNotFoundHtml(code: 404 | 410 = 404): string {
  const isExpired = code === 410;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${isExpired ? 'Listing Expired' : 'Listing Not Found'} | LeadNivesh</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f8fafc;
      color: #0f172a;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
      text-align: center;
    }
    .box {
      background: #fff;
      padding: 40px 30px;
      border-radius: 16px;
      border: 1px solid #e2e8f0;
      max-width: 440px;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
    }
    h1 { font-size: 1.5rem; margin-bottom: 10px; color: #1e293b; }
    p { color: #64748b; font-size: 0.95rem; margin-bottom: 20px; }
    .badge { background: #fee2e2; color: #b91c1c; padding: 4px 10px; border-radius: 9999px; font-size: 0.75rem; font-weight: 700; }
  </style>
</head>
<body>
  <div class="box">
    <div style="margin-bottom: 12px;"><span class="badge">${code}</span></div>
    <h1>${isExpired ? 'Share Link Expired or Revoked' : 'Property Not Available'}</h1>
    <p>${
      isExpired
        ? 'This property share link has expired or has been revoked by the listing broker.'
        : 'The property you are looking for is no longer available or does not exist.'
    }</p>
  </div>
</body>
</html>`;
}
