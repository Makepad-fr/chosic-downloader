import { downloadTrack } from "../src/downloader";

const TRACK_URL = 'https://www.chosic.com/download-audio/45401/';

test('Get track details', async () => {
    const track = await  downloadTrack({
        category: undefined,
        baseURL: TRACK_URL,
        headless: false,
    });
    expect(track.info.title.trim()).toBe('Purple Dream');
    expect(track.info.artistName.trim()).toBe('Ghostrifter Official');
  }, 100000);