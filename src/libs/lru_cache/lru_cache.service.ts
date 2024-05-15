import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import LRUNode from '@/libs/lru_cache/lru_cache_node';
import { PROGRESS_STATUS } from '@/constants/common';
import { LruServiceOptions } from '@/interfaces/lru';
import { LRU_CACHE_CONFIG } from '@/constants/configs/config';

@Injectable()
export class LruCacheService<T> {
  private cache: Map<string, LRUNode<T>>;

  private most: LRUNode<T>;

  private least: LRUNode<T>;

  private capacity: number = LRU_CACHE_CONFIG.defaultCapacity;

  private idLength: number = LRU_CACHE_CONFIG.defaultIdLength;

  constructor(
    @Inject('LRU_SERVICE_OPTIONS') { capacity, idLength }: LruServiceOptions,
  ) {
    this.capacity = capacity;
    this.idLength = idLength;
    this.cache = new Map<string, LRUNode<T>>();
    this.most = new LRUNode<T>('', PROGRESS_STATUS.IN_PROGRESS, null);
    this.least = new LRUNode<T>('', PROGRESS_STATUS.IN_PROGRESS, null);
    this.least.next = this.most;
    this.most.prev = this.least;
  }

  public hashId(inputString: string): string {
    const hash = createHash('sha256').update(inputString).digest('hex');
    return hash.substring(0, this.idLength);
  }

  private isHashId(key: string): boolean {
    const regex = `^[0-9a-f]{${this.idLength}}$`;
    return new RegExp(regex).test(key);
  }

  // Info Murky (20240422) This method I want to keep with object not static
  // eslint-disable-next-line class-methods-use-this
  private remove(node: LRUNode<T>): LRUNode<T> {
    // Info Murky (20240422) !. means non-null assertion operator
    node.prev!.next = node.next;
    node.next!.prev = node.prev;
    return node;
  }

  // Info Murky (20240422) This method I want to keep with object not static
  // eslint-disable-next-line class-methods-use-this
  private insert(node: LRUNode<T>, target: LRUNode<T>): void {
    node.next = target;
    node.prev = target.prev;
    target.prev!.next = node;
    target.prev = node;
  }

  public get(key: string): { status: PROGRESS_STATUS; value: T | null } {
    // Info Murky (20240423) key need to be hashed already
    if (!this.isHashId(key)) {
      key = this.hashId(key);
    }

    if (!this.cache.has(key)) {
      return {
        status: PROGRESS_STATUS.NOT_FOUND,
        value: null,
      };
    }

    const node = this.remove(this.cache.get(key)!);
    this.insert(node, this.most);
    return {
      status: node.status,
      value: node.value,
    };
  }

  public put(key: string, status: PROGRESS_STATUS, value: T | null): string {
    if (!this.isHashId(key)) {
      key = this.hashId(key);
    }
    const newNode = new LRUNode<T>(key, status, value);

    if (this.cache.has(key)) {
      this.remove(this.cache.get(key)!);
    }
    this.cache.set(key, newNode);
    this.insert(newNode, this.most);
    if (this.cache.size > this.capacity) {
      const leastNode = this.least.next!;
      this.remove(leastNode);
      this.cache.delete(leastNode.key);
    }

    return key;
  }
}
