const apiKey = "AIzaSyBZHa66RZZlUlsSoW3WNpPRoseA3bLpvm8";
const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
searchUrl.searchParams.set('part', 'snippet');
searchUrl.searchParams.set('eventType', 'live');
searchUrl.searchParams.set('type', 'video');
searchUrl.searchParams.set('order', 'viewCount');
searchUrl.searchParams.set('maxResults', '15');
searchUrl.searchParams.set('key', apiKey);
// searchUrl.searchParams.set('regionCode', 'VN');
searchUrl.searchParams.set('relevanceLanguage', 'vi');
searchUrl.searchParams.set('videoCategoryId', '20');
searchUrl.searchParams.set('q', 'esports gaming');

fetch(searchUrl.toString()).then(r => {
  console.log('Status:', r.status);
  return r.json();
}).then(data => {
  console.log(JSON.stringify(data, null, 2));
}).catch(e => console.error(e));
