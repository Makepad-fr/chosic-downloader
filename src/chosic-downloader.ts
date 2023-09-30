import { firefox, Page, Browser } from 'playwright-core';
import { assert } from './utils/assert';

const ACCEPT_COOKIE_BUTTON_SELECTOR =
  '//div[contains(@role,"dialog")]//button[contains(@mode, "primary")]';
const TRACK_iNFO_SELECTOR = '//div[contains(@class, "track-info")]';
const TRACK_INFO_DOWNLOAD_BUTTON_SELECTOR =
  '//div[contains(@class,"download-tags-div")]/a[contains(@class, "download-button")]';
const NAVLINKS_SELECTOR =
  "//div[contains(@class,'nav-links')]//a[@class=  'page-numbers']";
const LAST_PAGE_NUMBER_SELECTOR = `${NAVLINKS_SELECTOR}[last()]`;
const TRACK_TITLE_WRAPPER_SELECTOR =
  "//div[contains(@class, 'main-track')]/div[contains(@class, 'track-title-wrap')]";
const TRACK_TITLE_SELECTOR = '//div[contains(@class,"trackF-title-inside")]';
const TRACK_ARTIST_SELECTOR =
  '//div[@class="artist-track"]/a[contains(@class,"artist-name")]';
const TAGS_WRAPPER_SELECTOR = "//div[contains(@class,'tagcloud-names')]";
const TAG_SELECTOR = "//a[contains(@class,'tag-cloud-link-names')]";

type DownloaderOptions = {
  baseURL: string;
  headless?: boolean;
  browser?: Browser | undefined;
  page?: Page | undefined;
  bypassCookies?: boolean;
};

type DownloaderConfig = Required<DownloaderOptions>;

export type TrackInfo = {
  title: string;
  artistName: string;
  tags: string[];
};

export type Track = {
  info: TrackInfo;
  url: string;
  downloadedFilePath: string;
};
/**
 * Get the list of URLs for download pages of tracks
 * @param headless A boolean indicating that if the browser should run in headless mode or not
 * @returns The list of URLs for track oljnks
 */
export async function getTrackLinks(
  options: DownloaderOptions,
  pageNumber: number | undefined = undefined,
): Promise<{ config: DownloaderConfig; trackLinks: string[] }> {
  const config = await getDownloaderConfig(options);
  if (pageNumber === undefined) {
    await config.page.goto(getURL(config.baseURL, 1));
    // if the pageNumber is undefined, it will return all pages
    const pageCount = await getTotalPageCount(config.page);
    console.debug(`Page count ${pageCount}`);
    const links = [...(await getTrackDownloadLinks(config))];
    for (let i = 2; i <= pageCount; i++) {
      console.debug(`Current page: ${i}`);
      await config.page.goto(getURL(config.baseURL, i));
      links.push(...(await getTrackDownloadLinks(config)));
    }
    return { config, trackLinks: links };
  }
  await config.page.goto(getURL(config.baseURL, pageNumber));
  return { config, trackLinks: await getTrackDownloadLinks(config) };
}

/**
 * Downloads and returns the information about track
 * @param options downloader optons to use to download track
 * @returns The track information for the downloaded track
 */
export async function downloadTrack(
  options: DownloaderOptions,
): Promise<Track> {
  // Convert options to
  console.debug('Downloading track');
  const config = await getDownloaderConfig(options);
  await config.page.goto(config.baseURL);
  console.debug(`Navigated to ${config.baseURL}`);
  const trackInfo = await getTrackInformation(config);
  cleanDownloader(config);
  // TODO: Continue from here,download tracks
  return { info: trackInfo, url: '', downloadedFilePath: '' };
}

async function getTrackInformation(
  config: DownloaderConfig,
): Promise<TrackInfo> {
  // Wait for title wrapper
  try {
    const titleWrapperElement = await config.page.waitForSelector(
      TRACK_TITLE_WRAPPER_SELECTOR,
    );

    const tagsWrapperElement = await config.page.waitForSelector(
      TAGS_WRAPPER_SELECTOR,
    );
    const [trackTitleElement, trackArtistElement, tagElements] =
      await Promise.all([
        titleWrapperElement.$(TRACK_TITLE_SELECTOR),
        titleWrapperElement.$(TRACK_ARTIST_SELECTOR),
        tagsWrapperElement.$$(TAG_SELECTOR),
      ]);
    if (trackTitleElement === null) {
      console.error('Track title element is null');
      return Promise.reject('Track title element');
    }
    if (trackArtistElement === null) {
      console.error('Track artist element is null');
      return Promise.reject('Track artist element');
    }
    const [title, artist, tags] = await Promise.all([
      trackTitleElement.textContent(),
      trackArtistElement.textContent(),
      Promise.all(tagElements.map((e) => e.textContent())),
    ]);
    if (tags.some((e) => e === null)) {
      return Promise.reject("There's at least a tag which is null");
    }
    return {
      title: title as string,
      artistName: artist as string,
      tags: tags as string[],
    };
  } catch (e) {
    console.error('Error while getting track information');
    console.error(e);
  }
  return { title: '', tags: [], artistName: '' };
}

/**
 * Get the downloader config from the downloader options
 * @param options The downloader options to convert to downloader config
 * @returns Downloader config created from given downloader options
 */
async function getDownloaderConfig(
  options: DownloaderOptions,
): Promise<DownloaderConfig> {
  if (options.headless === undefined) {
    options.headless = true;
  }
  if (options.bypassCookies === undefined) {
    options.bypassCookies = false;
  }
  if (options.browser === undefined) {
    options.browser = await firefox.launch({ headless: options.headless });
  }
  if (options.page === undefined) {
    options.page = await options.browser.newPage();
  }
  return options as DownloaderConfig;
}

/**
 * Get the download links of tracks wth the given configuration
 * @param config The configuration to use when getting track links
 * @returns The list of track download links
 */
async function getTrackDownloadLinks(
  config: DownloaderConfig,
): Promise<string[]> {
  if (!config.bypassCookies) {
    try {
      const element = await config.page.waitForSelector(
        ACCEPT_COOKIE_BUTTON_SELECTOR,
      );
      console.debug('Accept cookie button found');
      await element.click();
      config.bypassCookies = true;
    } catch {
      console.debug('Cookie accept button is not present');
    }
  }
  console.debug('Getting track info elements');
  const trackInfoElements = await config.page.$$(TRACK_iNFO_SELECTOR);
  console.log(`Number of track info ${trackInfoElements.length}`);

  const trackLinks: string[] = (
    await Promise.all<string | null | undefined>(
      trackInfoElements.map<Promise<string | null | undefined>>(
        async (element): Promise<string | null | undefined> => {
          const trackLinkElement = await element.$(
            TRACK_INFO_DOWNLOAD_BUTTON_SELECTOR,
          );
          return trackLinkElement?.getAttribute('href');
        },
      ),
    )
  ).filter((e) => e !== undefined && e !== null) as string[];

  if (trackLinks.length === 0) {
    throw new Error('Track lists is empty');
  }
  assert(
    trackLinks.length === trackInfoElements.length,
    `Number of track links ${trackLinks.length} is different then number of track elements ${trackInfoElements.length}`,
  );
  return trackLinks;
}

/**
 * Cleansup the downloader configuration, closes the page and the browser
 * @param config The configuration to cleanup
 */
export async function cleanDownloader(config: DownloaderConfig) {
  await config.page.close();
  await config.browser.close();
}

/**
 * Get the number of last page
 * @param page The page instance to select from
 * @returns The number of last page
 */
async function getTotalPageCount(page: Page): Promise<number> {
  const lastPageNumber = await page.textContent(LAST_PAGE_NUMBER_SELECTOR);
  assert(lastPageNumber !== null, 'Last page number is null');
  return parseInt(lastPageNumber);
}

/**
 * Creates the URL for given page number
 * @param baseUrl The base URL
 * @param pageNumber The page number to add to the URL
 * @returns The URL that contains the page number
 */
function getURL(baseUrl: string, pageNumber: number): string {
  return `${baseUrl}/page/${pageNumber}`;
}
