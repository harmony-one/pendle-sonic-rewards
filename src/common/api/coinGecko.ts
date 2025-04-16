import { Address } from 'cluster';
import * as fs from 'fs';
import * as path from 'path';

interface PriceCache {
  price: number;
  timestamp: number;
}

export const CoinGeckoTokenIdsMap: Record<string, string> = {
  // Pendle token
  "0xd9eaa386ccd65f30b366d6b9e34e1a4d7bd21dbc": "pendle",
  
  // Common stablecoins on Sonic
  "0xd988097fb8612ae489eb654958ee926fd7ce18b5": "usd-coin", // USDC.e
  "0xf6e2ddf7a149c171e591c8d58449e371e6dc7570": "tether", // wstscUSD (using USDT as price)
  
  // SONIC token
  "0xf1ef7d2d4c0c881cd634481e0586ed5d2871a74b": "sonic-token",
  
  // Add more token mappings as needed
  // Format: "lowercase_address": "coingecko_id"
};

export class CoinGeckoService {
  private priceCache: Record<string, Record<string, PriceCache>> = {};
  private cacheTimeoutMs: number;
  private readonly cacheFilePath: string;

  constructor(cacheTimeoutMinutes = 2, cacheFilePath = './crypto-price-cache.json') {
    // Convert minutes to milliseconds
    this.cacheTimeoutMs = cacheTimeoutMinutes * 60 * 1000;
    this.cacheFilePath = path.resolve(cacheFilePath);
    this.loadCacheFromDisk();
  }

  /**
   * Loads the cache from the local file if it exists
   */
  private loadCacheFromDisk(): void {
    try {
      if (fs.existsSync(this.cacheFilePath)) {
        const cacheData = fs.readFileSync(this.cacheFilePath, 'utf-8');
        this.priceCache = JSON.parse(cacheData);
        console.log('Price cache loaded from disk');
      }
    } catch (error) {
      console.error('Error loading cache from disk:', error);
      // Initialize empty cache if loading fails
      this.priceCache = {};
    }
  }

  /**
   * Saves the current cache to the local file
  */
  private saveCacheToDisk(): void {
    try {
      const cacheDir = path.dirname(this.cacheFilePath);
      
      // Ensure the directory exists
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }
      
      fs.writeFileSync(this.cacheFilePath, JSON.stringify(this.priceCache, null, 2));
    } catch (error) {
      console.error('Error saving cache to disk:', error);
    }
  }

  /**
   * Fetches the current price of a cryptocurrency from CoinGecko with caching
   * @param tokenId The CoinGecko ID of the token (e.g., 'pendle', 'bitcoin', 'ethereum')
   * @param currency The currency to get the price in (default: 'usd')
   * @returns The current token price
   */
  async getTokenPrice(tokenId: string, currency = 'usd'): Promise<number> {
    // Initialize cache structure if needed
    if (!this.priceCache[tokenId]) {
      this.priceCache[tokenId] = {};
    }

    // Check if we have a cached price that's still valid
    const cachedData = this.priceCache[tokenId][currency];
    const now = Date.now();

    if (cachedData && now - cachedData.timestamp < this.cacheTimeoutMs) {
      return cachedData.price;
    }

    try {
      // Make API call to CoinGecko
      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${tokenId}&vs_currencies=${currency}`,
        {
          headers: {
            'Accept': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data[tokenId]) {
        throw new Error(`Token ID '${tokenId}' not found on CoinGecko`);
      }
      
      const price = data[tokenId][currency];

      // Update cache
      this.priceCache[tokenId][currency] = {
        price,
        timestamp: now
      };
      
      this.saveCacheToDisk();
      
      return price;
    
    } catch (error) {
      console.error(`Error fetching ${tokenId} price:`, error);
      
      // Return cached price if available, even if expired
      if (cachedData) {
        return cachedData.price;
      }
      
      throw error;
    }
  }

  /**
   * Convenience method to get Pendle price
   * @param currency The currency to get the price in (default: 'usd')
   * @returns The current Pendle price
   */
  async getPendlePrice(currency = 'usd'): Promise<number> {
    return this.getTokenPrice('pendle', currency);
  }

  getCoinGeckoIdFromAddress(address: string): string | null {
    const normalizedAddress = address.toLowerCase();
    return CoinGeckoTokenIdsMap[normalizedAddress] || null;
  }

  /**
   * Clear the entire price cache
   */
  clearCache(): void {
    this.priceCache = {};
    this.saveCacheToDisk();
  }

  /**
   * Clear the cache for a specific token
   * @param tokenId The CoinGecko ID of the token
   */
  clearTokenCache(tokenId: string): void {
    if (this.priceCache[tokenId]) {
      delete this.priceCache[tokenId];
      this.saveCacheToDisk();
    }
  }

  /**
   * Update the cache timeout duration
   * @param minutes The new timeout in minutes
   */
  setCacheTimeout(minutes: number): void {
    this.cacheTimeoutMs = minutes * 60 * 1000;
  }
}

const coinGeckoService = new CoinGeckoService()

export default coinGeckoService