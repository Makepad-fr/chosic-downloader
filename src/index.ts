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
  console.log(trackLinks);
  for (const trackLink of trackLinks) {
    console.debug(`Current track link ${trackLink}`);
    const track = await downloadTrack({ baseURL: trackLink, headless });
    console.log('Track');
    console.log(track);
    tracks.push(track);
  }
  // const tracks = await Promise.all(
  //   trackLinks.map(async (trackLink) => {
  //     const track = await
  //     return track;
  //   }),
  // );
  console.debug('Tracks');
  console.log(JSON.stringify(tracks, undefined, 4));
}

main(true).then();
