// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loadChannelsMock, openChannelMock } = vi.hoisted(() => ({
  loadChannelsMock: vi.fn(),
  openChannelMock: vi.fn(),
}));

vi.mock('../../stores/channel-actions', () => ({
  loadChannels: loadChannelsMock,
  openChannel: openChannelMock,
}));

import { switchTab } from '../../components/channels/ChannelTabBar';
import { useStore } from '../../stores';

describe('ChannelTabBar switchTab', () => {
  let localStorageData: Record<string, string>;

  beforeEach(() => {
    localStorageData = {};
    const storage = {
      getItem: vi.fn((key: string) => localStorageData[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        localStorageData[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete localStorageData[key];
      }),
      clear: vi.fn(() => {
        localStorageData = {};
      }),
    };
    vi.stubGlobal('localStorage', storage);
    Object.defineProperty(window, 'localStorage', {
      value: storage,
      configurable: true,
    });
    useStore.setState({
      currentTab: 'chat',
      currentChannel: null,
      channelIsDM: false,
      sidebarOpen: true,
      sidebarAutoCollapsed: false,
      jianOpen: true,
      jianAutoCollapsed: false,
      activePanel: null,
    } as never);
    vi.clearAllMocks();
  });

  it('keeps the right workspace companion state independent from tab switches', () => {
    localStorage.setItem('hana-jian-plugin:hanako-hyperframes', 'closed');
    localStorage.setItem('hana-jian-plugin:other-plugin', 'open');

    switchTab('plugin:hanako-hyperframes');

    expect(useStore.getState().currentTab).toBe('plugin:hanako-hyperframes');
    expect(useStore.getState().jianOpen).toBe(true);

    switchTab('plugin:other-plugin');

    expect(useStore.getState().currentTab).toBe('plugin:other-plugin');
    expect(useStore.getState().jianOpen).toBe(true);
  });

  it('refreshes the selected channel when entering the channels tab', () => {
    useStore.setState({
      currentTab: 'chat',
      currentChannel: 'ch_crew',
      channelIsDM: false,
    } as never);

    switchTab('channels');

    expect(useStore.getState().currentTab).toBe('channels');
    expect(openChannelMock).toHaveBeenCalledWith('ch_crew', false);
    expect(loadChannelsMock).not.toHaveBeenCalled();
  });

  it('refreshes the channel list when entering channels without a selection', () => {
    switchTab('channels');

    expect(loadChannelsMock).toHaveBeenCalledTimes(1);
    expect(openChannelMock).not.toHaveBeenCalled();
  });
});
