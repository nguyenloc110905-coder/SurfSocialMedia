const apiKey = "AIzaSyAbCosflDngpzqk0po95bAzR38GLxXJb-s";
const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
searchUrl.searchParams.set('part', 'snippet');
searchUrl.searchParams.set('eventType', 'live');
searchUrl.searchParams.set('type', 'video');
searchUrl.searchParams.set('order', 'viewCount');
searchUrl.searchParams.set('maxResults', '1');
searchUrl.searchParams.set('key', apiKey);
searchUrl.searchParams.set('relevanceLanguage', 'vi');

fetch(searchUrl.toString()).then(r => {
  console.log('Status:', r.status);
  return r.json();
}).then(data => {
  if (data.error) console.log(data.error.message);
  else console.log('Items:', data.items.length);
}).catch(e => console.error(e));
