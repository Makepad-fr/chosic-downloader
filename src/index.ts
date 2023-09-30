import {
  cleanDownloader,
  downloadTrack,
  getTrackLinks,
} from './chosic-downloader';

async function main(headless: boolean) {
  const { config, trackLinks } = await getTrackLinks({
    baseURL: 'https://www.chosic.com/free-music/lofi',
    headless: headless,
  });
  await cleanDownloader(config);
  console.log(`Number of track links: ${trackLinks.length}`);
  const tracks = [];
  for (const trackLink of trackLinks) {
    const track = await downloadTrack({ baseURL: trackLink, headless });
    tracks.push(track);
  }
  console.debug('Tracks');
  console.log(JSON.stringify(tracks, undefined, 4));
}

main(true).then();
