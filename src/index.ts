import { getTrackLinks } from './chosic-downloader';

async function main(headless: boolean) {
  const tracklinks = await getTrackLinks({
    baseURL: 'https://www.chosic.com/free-music/lofi',
    headless: false,
  });
  console.log(`Number of track links: ${tracklinks.length}`);
  //   TODO: Download the track
  //  TODO: Get track information
}

main(false).then();
