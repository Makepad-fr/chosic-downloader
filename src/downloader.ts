import { firefox, Page, Browser } from 'playwright-core';
import { assert } from './utils/assert';
import { tmpdir } from 'os';
import { mkdirSync, createWriteStream, unlink } from 'fs';
import { join } from 'path';
import * as https from 'https';
const FREE_MUSIC_BASE_URL = 'https://www.chosic.com/free-music';

const ACCEPT_COOKIE_BUTTON_SELECTOR =
  '//div[contains(@role,"dialog")]//button[contains(@mode, "primary")]';
const TRACK_iNFO_SELECTOR = '//div[contains(@class, "track-info")]';
const TRACK_INFO_DOWNLOAD_BUTTON_SELECTOR =
  '//div[contains(@class,"download-tags-div")]/a[contains(@class, "download-button")]';
const NAVLINKS_SELECTOR =
  "//div[contains(@class,'nav-links')]//a[@class=  'page-numbers']";
const LAST_PAGE_NUMBER_SELECTOR = `${NAVLINKS_SELECTOR}[last()]`;
const MAIN_TRACK_SELECTOR = "//div[contains(@class, 'main-track')]";
const TRACK_TITLE_WRAPPER_SELECTOR = `${MAIN_TRACK_SELECTOR}/div[contains(@class, 'track-title-wrap')]`;
const TRACK_TITLE_SELECTOR = '//div[contains(@class,"trackF-title-inside")]';
const TRACK_ARTIST_SELECTOR =
  '//div[@class="artist-track"]/a[contains(@class,"artist-name")]';
const TAGS_WRAPPER_SELECTOR = "//div[contains(@class,'tagcloud-names')]";
const TAG_SELECTOR = "//a[contains(@class,'tag-cloud-link-names')]";
const DOWNLOAD_BUTTON_WRAPPER_SELECTOR = `${MAIN_TRACK_SELECTOR}/div[contains(@class,'track-download-wrap')]`;
const DOWNLOAD_BUTTON_SELECTOR = `${DOWNLOAD_BUTTON_WRAPPER_SELECTOR}/button[contains(@class,"download")]`;
const DOWNLOAD_LINK_SELECTOR = '//a[contains(@class,"download2")]';
const DOWNLOADER_TEMP_FOLDER_PREFIX = 'choisic-downloads';

type DownloaderOptions = {
  category: string | undefined;
  headless?: boolean;
  browser?: Browser | undefined;
  page?: Page | undefined;
  bypassCookies?: boolean;
  downloadFilePath?: string;
  baseURL?: string;
};

type DownloaderConfig = Required<Omit<DownloaderOptions, 'category'>>;

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
    await acceptCookies(config);
    // if the pageNumber is undefined, it will return all pages
    const pageCount = await getTotalPageCount(config.page);
    console.debug(`Page count ${pageCount}`);
    const links = [...(await getTrackDownloadLinks(config))];
    for (let i = 2; i <= pageCount; i++) {
      console.debug(`Current page: ${i}`);
      await config.page.goto(getURL(config.baseURL, i));
      await acceptCookies(config);
      links.push(...(await getTrackDownloadLinks(config)));
    }
    return { config, trackLinks: links };
  }
  await config.page.goto(getURL(config.baseURL, pageNumber));
  await acceptCookies(config);
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
  await acceptCookies(config);
  console.debug(`Navigated to ${config.baseURL}`);
  const [trackInfo, filePath] = await Promise.all([
    getTrackInformation(config.page),
    downloadTrackFile(
      config.page,
      join(config.downloadFilePath, `${Date.now()}.mp3`),
    ),
  ]);
  assert(filePath !== null, 'Downloaded file path is null');
  cleanDownloader(config);
  return { info: trackInfo, url: config.baseURL, downloadedFilePath: filePath };
}

async function getTrackInformation(page: Page): Promise<TrackInfo> {
  // Wait for title wrapper
  try {
    const titleWrapperElement = await page.waitForSelector(
      TRACK_TITLE_WRAPPER_SELECTOR,
    );

    const tagsWrapperElement = await page.waitForSelector(
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
 * Downloads the current track and returns the path of the file
 * @param page The current page for the track details
 * @returns The path of the downloaded track file
 */
async function downloadTrackFile(page: Page, destinationFilePath: string) {
  const trackDownloadLink = await getTrackFileDownloadLink(page);
  await downloadFile(trackDownloadLink as string, destinationFilePath);
  return destinationFilePath;
}

async function getTrackFileDownloadLink(page: Page) {
  try {
    console.debug(`Download button selector ${DOWNLOAD_BUTTON_SELECTOR}`);
    const downloadButtonElement = await page.waitForSelector(
      DOWNLOAD_BUTTON_SELECTOR,
    );
    const downloadButtonDataURL =
      await downloadButtonElement.getAttribute('data-url');
    if (downloadButtonDataURL !== null) {
      return downloadButtonDataURL;
    }
    console.info(
      'Download button data url is null, continue by clicking on it and getting the URL from popup',
    );
    await downloadButtonElement.click();
    console.debug('Clicked on download button');
    const downloadLinkElement = await page.waitForSelector(
      DOWNLOAD_LINK_SELECTOR,
    );
    console.debug('Download link appeared');
    const downloadLink = await downloadLinkElement.getAttribute('href');
    return downloadLink;
  } catch (e) {
    console.error('Error while clicking on the download button');
    console.error(e);
    throw e;
  }
}

async function downloadFile(
  url: string,
  destinationPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(destinationPath);
    https
      .get(url, (response) => {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      })
      .on('error', (error) => {
        unlink(destinationPath, () => {}); // Delete the file on error
        reject(error);
      });
  });
}
/**
 * Get the downloader config from the downloader options
 * @param options The downloader options to convert to downloader config
 * @returns Downloader config created from given downloader options
 */
async function getDownloaderConfig(
  options: DownloaderOptions,
): Promise<DownloaderConfig> {
  if (options.baseURL === undefined) {
    options.baseURL = FREE_MUSIC_BASE_URL;
  }
  if (options.category !== undefined) {
    options.baseURL = join(options.baseURL, options.category);
  }
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
  if (options.downloadFilePath === undefined) {
    const systemTmpDir = tmpdir();
    // Create a unique name for your new temporary directory
    const uniqueDirName = `${DOWNLOADER_TEMP_FOLDER_PREFIX}-${Date.now()}`;
    const newTempDirPath = join(systemTmpDir, uniqueDirName);
    // Create the new temporary directory
    mkdirSync(newTempDirPath);
    options.downloadFilePath = newTempDirPath;
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

async function acceptCookies(config: DownloaderConfig) {
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
