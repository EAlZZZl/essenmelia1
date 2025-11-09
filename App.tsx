import React, { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import { Event, ProgressStep, StepTemplate, StepSetTemplate } from './types';
import Header, { SortOrder } from './components/Header';
import EventCard from './components/EventCard';
import EventDetailView from './components/EventDetailView';
import FAB from './components/FAB';
import Modal from './components/Modal';
import FilterChips from './components/FilterChips';
import ManageTagsModal from './components/ManageTagsModal';
import EventEditModal from './components/EventEditModal';
import TagInput from './components/TagInput';
import ContextMenu, { ContextMenuAction } from './components/ContextMenu';
import { PencilIcon, TrashIcon, ExclamationTriangleIcon, CheckIcon, PlusIcon, LoadingSpinnerIcon, ArchiveBoxIcon } from './components/icons';
import StepsEditorPanel from './components/StepsEditorPanel';
import ControlsBar from './components/ControlsBar';
import SettingsModal from './components/SettingsModal';
import DatabaseManagerModal, { DEFAULT_DB_NAME_EXPORT, DEMO_DB_NAME_EXPORT, TEMP_STORAGE_DB_NAME_EXPORT } from './components/DatabaseManagerModal';
import Snackbar from './components/Snackbar';
import WelcomeModal from './components/WelcomeModal';
import ManageSelectionTagsModal from './components/ManageSelectionTagsModal';


// =================================================================
// IndexedDB 数据库逻辑
// =================================================================
const DB_VERSION = 1;
const STORES = {
    events: 'events',
    tags: 'tags',
    stepTemplates: 'stepTemplates',
    stepSetTemplates: 'stepSetTemplates',
    metadata: 'metadata',
    originalImages: 'originalImages',
};
const DB_PREFIX = 'essenmelia-db';
const DEFAULT_DB_NAME = DEFAULT_DB_NAME_EXPORT;
const DEMO_DB_NAME = DEMO_DB_NAME_EXPORT;
const SETTINGS_DB_NAME = 'essenmelia-db-settings';


const dbConnections = new Map<string, IDBDatabase>();

const initDB = (dbName: string): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        if (dbConnections.has(dbName)) {
            return resolve(dbConnections.get(dbName)!);
        }

        const request = indexedDB.open(dbName, DB_VERSION);

        request.onerror = () => {
            console.error(`数据库错误 (${dbName}):`, request.error);
            reject(request.error);
        };

        request.onsuccess = (event) => {
            const dbInstance = (event.target as IDBOpenDBRequest).result;
            dbConnections.set(dbName, dbInstance);
            resolve(dbInstance);
        };

        request.onupgradeneeded = (event) => {
            const dbInstance = (event.target as IDBOpenDBRequest).result;
            Object.values(STORES).forEach(storeName => {
                 if (!dbInstance.objectStoreNames.contains(storeName)) {
                    if(storeName === STORES.events || storeName === STORES.stepTemplates || storeName === STORES.stepSetTemplates) {
                        dbInstance.createObjectStore(storeName, { keyPath: 'id' });
                    } else if (storeName === STORES.originalImages) {
                        // For original images, the key will be the eventId, which is not part of the File/Blob object itself.
                        // So, we don't specify a keyPath here.
                        dbInstance.createObjectStore(storeName);
                    }
                    else {
                        dbInstance.createObjectStore(storeName);
                    }
                }
            });
        };
    });
};


const getStore = (dbName: string, storeName: string, mode: IDBTransactionMode): Promise<IDBObjectStore> => {
    return initDB(dbName).then(dbInstance => {
        const transaction = dbInstance.transaction(storeName, mode);
        return transaction.objectStore(storeName);
    });
};

async function saveDataInStore<T>(dbName: string, storeName: string, data: T[]): Promise<void> {
    const store = await getStore(dbName, storeName, 'readwrite');
    return new Promise((resolve, reject) => {
        const clearRequest = store.clear();
        clearRequest.onerror = (event) => reject((event.target as IDBRequest).error);
        clearRequest.onsuccess = () => {
            if (data.length === 0) {
                resolve();
                return;
            }
            const transaction = store.transaction;
            data.forEach(item => {
                store.put(item);
            });
            transaction.oncomplete = () => resolve();
            transaction.onerror = (event) => reject((event.target as IDBRequest).error);
        };
    });
}

const saveDataInStoreByKey = async (dbName: string, storeName: string, data: any, key: string): Promise<void> => {
    const store = await getStore(dbName, storeName, 'readwrite');
    return new Promise((resolve, reject) => {
        const request = store.put(data, key);
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject((event.target as IDBRequest).error);
    });
};


async function insertDataInStore<T>(dbName: string, storeName: string, data: T[]): Promise<void> {
    if (data.length === 0) return Promise.resolve();
    const store = await getStore(dbName, storeName, 'readwrite');
    return new Promise((resolve, reject) => {
        const transaction = store.transaction;
        data.forEach(item => {
            store.put(item); // 'put' works like add/update. With new IDs, it's an add.
        });
        transaction.oncomplete = () => resolve();
        transaction.onerror = (event) => reject((event.target as IDBRequest).error);
    });
}

const saveTagsInStore = async (dbName: string, tags: string[]): Promise<void> => {
    const store = await getStore(dbName, STORES.tags, 'readwrite');
    return new Promise((resolve, reject) => {
        const request = store.put(tags, 'allTags');
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

async function getAllDataFromStore<T>(dbName: string, storeName: string): Promise<T[]> {
    const store = await getStore(dbName, storeName, 'readonly');
    return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export const getDataFromStoreByKey = async (dbName: string, storeName: string, key: string): Promise<any> => {
    const store = await getStore(dbName, storeName, 'readonly');
    return new Promise((resolve, reject) => {
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject((event.target as IDBRequest).error);
    });
};

export const deleteDataFromStoreByKey = async (dbName: string, storeName: string, key: string): Promise<void> => {
    const store = await getStore(dbName, storeName, 'readwrite');
    return new Promise((resolve, reject) => {
        const request = store.delete(key);
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject((event.target as IDBRequest).error);
    });
};

const getTagsFromStore = async (dbName: string): Promise<string[]> => {
    const store = await getStore(dbName, STORES.tags, 'readonly');
    return new Promise((resolve, reject) => {
        const request = store.get('allTags');
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
};

const getMetadata = async (dbName: string, key: IDBValidKey): Promise<any> => {
    const store = await getStore(dbName, STORES.metadata, 'readonly');
    return new Promise((resolve, reject) => {
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

const saveMetadata = async (dbName: string, key: IDBValidKey, value: any): Promise<void> => {
    const store = await getStore(dbName, STORES.metadata, 'readwrite');
    return new Promise((resolve, reject) => {
        const request = store.put(value, key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

// =================================================================
// Data Definitions
// =================================================================
const tutorialEvent: Event = {
    id: 'event-tutorial-1',
    title: "应用导览：探索您的工作区",
    description: "这是一个快速导览，帮助您熟悉应用的主要功能区域。跟随这些步骤来了解如何充分利用它。",
    createdAt: new Date(),
    tags: ['教程'],
    steps: [
        { id: 'step-tutorial-1', description: "🧭 顶部导航栏：屏幕顶部的栏是您的指挥中心。您可以在这里搜索所有事件，对它们进行排序，以及访问设置菜单 ⚙️。", timestamp: new Date(), completed: false },
        { id: 'step-tutorial-2', description: "📊 筛选器：在导航栏下方，您可以使用筛选器快速找到您需要的事件。按“进行中”或“已完成”等状态筛选，或通过点击标签进行组合筛选。💡 提示：在标签管理中，您可以用空格一次性添加多个标签！", timestamp: new Date(), completed: false },
        { id: 'step-tutorial-3', description: "🗂️ 事件列表：这里是您所有项目和目标的家。💡 提示：长按任何卡片可以进入选择模式，进行批量删除等操作。", timestamp: new Date(), completed: false },
        { id: 'step-tutorial-4', description: "➕ “添加”按钮：右下角的悬浮按钮是创建新事件的最快方式。", timestamp: new Date(), completed: false },
        { id: 'step-tutorial-5', description: "📄 事件详情：点击任何事件卡片即可进入详情视图。在这里，您可以看到所有相关信息，包括一个方便的“步骤概览”网格。", timestamp: new Date(), completed: false },
        { id: 'step-tutorial-6', description: "⚡ 快速更新：在“步骤概览”中，按住第一个方块并向右滑动，可以快速将所有后续步骤标记为已完成。再次滑动即可撤销！", timestamp: new Date(), completed: false },
        { id: 'step-tutorial-7', description: "🛠️ 步骤编辑器：在详情视图中点击“编辑步骤”，即可进入强大的步骤编辑器。在这里，您可以添加、删除和重新排序步骤。您还可以将常用步骤拖入“归档”，或将整个工作流程保存为“模板”以便将来使用。", timestamp: new Date(), completed: false },
        { id: 'step-tutorial-8', description: "🔐 数据与设置：通过顶部导航栏的设置菜单 ⚙️，您可以管理您的数据。创建多个数据库（例如“工作”和“个人”），并随时导入或导出您的数据。您的数据，由您掌控。", timestamp: new Date(), completed: false },
        { id: 'step-tutorial-9', description: "🎉 教程完成：现在您已经了解了基本布局！您可以将此导览事件标记为已完成，然后删除它。祝您使用愉快！", timestamp: new Date(), completed: false },
    ],
    imageUrl: 'https://images.unsplash.com/photo-1543286386-713bdd548da4?q=80&w=2070&auto=format&fit=crop',
};

const demoEvents: Event[] = [
  // ... (same 10 events as before)
  {
    id: 'event-1',
    title: '上线新网站',
    description: '完成公司新网站上线的所有阶段，从设计到部署。',
    createdAt: new Date('2023-10-01T09:00:00Z'),
    steps: [
      { id: 'step-1-1', description: '完成 UI/UX 设计模型', timestamp: new Date('2023-10-05T14:00:00Z'), completed: true },
      { id: 'step-1-2', description: '开发前端组件', timestamp: new Date('2023-10-15T18:00:00Z'), completed: true },
      { id: 'step-1-3', description: '与后端 API 集成', timestamp: new Date('2023-10-22T12:00:00Z'), completed: false },
      { id: 'step-1-4', description: '进行用户验收测试', timestamp: new Date('2023-10-28T16:00:00Z'), completed: false },
    ],
    imageUrl: 'https://images.unsplash.com/photo-1559028006-44d053215926?q=80&w=2070&auto=format&fit=crop',
    tags: ['重要', '网页开发'],
  },
  {
    id: 'event-2',
    title: '第四季度营销活动',
    description: '策划并执行假日季的营销活动。',
    createdAt: new Date('2023-09-20T11:00:00Z'),
    steps: [
      { id: 'step-2-1', description: '定义活动目标和关键绩效指标', timestamp: new Date('2023-09-25T10:00:00Z'), completed: true },
      { id: 'step-2-2', description: '创作广告素材和文案', timestamp: new Date('2023-10-02T15:00:00Z'), completed: true },
    ],
    imageUrl: 'https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?q=80&w=2076&auto=format&fit=crop',
    tags: ['营销'],
  },
   {
    id: 'event-3',
    title: '移动应用重构',
    description: '重构 iOS 和 Android 移动应用的旧代码库。',
    createdAt: new Date('2023-11-01T10:00:00Z'),
    steps: [],
    tags: ['技术债', '移动开发'],
  },
  {
    id: 'event-4',
    title: '计划公司年度静修',
    description: '为整个团队组织一次令人难忘的年度静修活动，重点关注团队建设和未来一年的战略规划。',
    createdAt: new Date('2023-11-05T10:00:00Z'),
    steps: [
      { id: 'step-4-1', description: '调查团队偏好', timestamp: new Date(), completed: true },
      { id: 'step-4-2', description: '研究和预订场地', timestamp: new Date(), completed: true },
      { id: 'step-4-3', description: '规划活动日程', timestamp: new Date(), completed: false },
    ],
    tags: ['公司文化', '活动策划'],
  },
  {
    id: 'event-5',
    title: '撰写并出版一本电子书',
    description: '完成关于现代前端开发的电子书的整个流程，从大纲到最终出版。',
    createdAt: new Date('2023-08-15T10:00:00Z'),
    steps: [
      { id: 'step-5-1', description: '创建详细大纲', timestamp: new Date(), completed: true },
      { id: 'step-5-2', description: '撰写第一稿', timestamp: new Date(), completed: true },
      { id: 'step-5-3', description: '编辑和校对', timestamp: new Date(), completed: true },
      { id: 'step-5-4', description: '设计封面和排版', timestamp: new Date(), completed: false },
      { id: 'step-5-5', description: '在平台上发布', timestamp: new Date(), completed: false },
    ],
    tags: ['个人项目', '写作'],
  },
  {
    id: 'event-6',
    title: '马拉松训练',
    description: '遵循为期16周的训练计划，为即将到来的城市马拉松做准备，目标是跑进4小时。',
    createdAt: new Date('2023-10-10T10:00:00Z'),
    steps: [
      { id: 'step-6-1', description: '完成第1-4周的基础训练', timestamp: new Date(), completed: true },
      { id: 'step-6-2', description: '完成第5-8周的里程累积', timestamp: new Date(), completed: false },
    ],
    imageUrl: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?q=80&w=2070&auto=format&fit=crop',
    tags: ['健康', '个人项目'],
  },
  {
    id: 'event-7',
    title: '学习一门新语言：西班牙语',
    description: '通过每日练习和每周课程达到会话流利水平 (B1)。',
    createdAt: new Date('2023-09-01T10:00:00Z'),
    steps: [
      { id: 'step-7-1', description: '完成 Duolingo 基础课程', timestamp: new Date(), completed: true },
      { id: 'step-7-2', description: '与语言伙伴进行10次会话', timestamp: new Date(), completed: false },
    ],
    tags: ['学习', '个人发展'],
  },
  {
    id: 'event-8',
    title: '装修厨房',
    description: '管理厨房装修项目，从设计到承包商协调，确保在预算内按时完成。',
    createdAt: new Date('2023-11-12T10:00:00Z'),
    steps: [],
    imageUrl: 'https://images.unsplash.com/photo-1556912173-3bb406ef7e77?q=80&w=2070&auto=format&fit=crop',
    tags: ['家居', '重要'],
  },
  {
    id: 'event-9',
    title: '建立一个个人作品集网站',
    description: '使用 React 和 Tailwind CSS 创建一个展示我作品的现代网站，并部署到 Vercel。',
    createdAt: new Date('2023-10-25T10:00:00Z'),
    steps: [
      { id: 'step-9-1', description: '设计网站线框图', timestamp: new Date(), completed: true },
      { id: 'step-9-2', description: '开发可重用组件', timestamp: new Date(), completed: false },
      { id: 'step-9-3', description: '部署到 Vercel', timestamp: new Date(), completed: false },
    ],
    tags: ['网页开发', '个人项目'],
  },
  {
    id: 'event-10',
    title: '组织数字文件',
    description: '整理和归档所有云存储和本地驱动器上的数字文件，创建一个可持续的组织系统。',
    createdAt: new Date('2023-11-15T10:00:00Z'),
    steps: [
      { id: 'step-10-1', description: '分类所有文件', timestamp: new Date(), completed: false },
    ],
    tags: ['效率', '整理'],
  }
];

const demoTags = [...new Set(demoEvents.flatMap(e => e.tags || []))];
const demoStepTemplates: StepTemplate[] = [
    { id: 'template-1', description: '计划会议' },
    { id: 'template-2', description: '发送跟进邮件' },
    { id: 'template-3', description: '部署到生产环境' },
];
const demoStepSetTemplates: StepSetTemplate[] = [
    { 
        id: 'set-1', 
        name: '标准网页发布流程', 
        steps: [
            { id: 'set-1-step-1', description: '需求评审' },
            { id: 'set-1-step-2', description: 'UI/UX 设计' },
            { id: 'set-1-step-3', description: '前端开发' },
            { id: 'set-1-step-4', description: '后端开发' },
            { id: 'set-1-step-5', description: '测试' },
            { id: 'set-1-step-6', description: '部署' },
        ] 
    },
];

const reviveEventDates = (event: Event): Event => ({
    ...event,
    createdAt: new Date(event.createdAt),
    steps: event.steps.map(step => ({
        ...step,
        timestamp: new Date(step.timestamp)
    }))
});

export type OverviewBlockSize = 'sm' | 'md' | 'lg';

interface ActiveFilters {
  status: 'all' | 'in-progress' | 'completed';
  tags: string[];
}

type PendingAction =
  | { type: 'ADD_EVENT'; payload: { event: Event, originalImage?: File } }
  | { type: 'UPDATE_EVENT'; payload: { event: Event, originalImage?: File | 'remove' } }
  | { type: 'DELETE_EVENT'; payload: string } // eventId
  | { type: 'UPDATE_EVENT_STEPS'; payload: { eventId: string; steps: ProgressStep[] } }
  | { type: 'ADD_TAG'; payload: string } // new tag
  | { type: 'DELETE_TAGS'; payload: string[] } // tags to delete
  | { type: 'RENAME_TAG'; payload: { oldTag: string; newTag: string } }
  | { type: 'REORDER_TAGS'; payload: string[] }; // reordered tags

/**
 * 在客户端调整图片大小以进行优化。
 * @param file 要调整大小的图片文件。
 * @param options 包含 maxWidth、maxHeight 和 quality 的配置对象。
 * @returns 返回一个解析为优化后图片的 Base64 数据 URL 的 Promise。
 */
const resizeImage = (file: File, options: { maxWidth: number; maxHeight: number; quality: number }): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const { maxWidth, maxHeight, quality } = options;
        let { width, height } = img;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('无法获取 canvas 上下文'));
        }
        ctx.drawImage(img, 0, 0, width, height);
        
        // 对于 PNG 等可能没有背景的格式，我们添加一个白色背景。
        // 这可以防止在转换为 JPEG 时出现黑色背景。
        if (file.type !== 'image/jpeg') {
            const compositeCanvas = document.createElement('canvas');
            compositeCanvas.width = width;
            compositeCanvas.height = height;
            const compositeCtx = compositeCanvas.getContext('2d')!;
            compositeCtx.fillStyle = '#FFFFFF'; // 白色背景
            compositeCtx.fillRect(0, 0, width, height);
            compositeCtx.drawImage(canvas, 0, 0);
            resolve(compositeCanvas.toDataURL('image/jpeg', quality));
        } else {
            resolve(canvas.toDataURL('image/jpeg', quality));
        }
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};


const App: React.FC = () => {
  const [activeDbName, setActiveDbName] = useState<string>('');
  const [userDbNames, setUserDbNames] = useState<string[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [customTags, setCustomTags] = useState<string[]>([]);
  const [stepTemplates, setStepTemplates] = useState<StepTemplate[]>([]);
  const [stepSetTemplates, setStepSetTemplates] = useState<StepSetTemplate[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  const [dbError, setDbError] = useState<Error | null>(null);
  
  const [actionNotification, setActionNotification] = useState<{ id: number, message: string } | null>(null);
  const [dbStatus, setDbStatus] = useState<{ id: number; message: string; type: 'loading' | 'success' | 'error' | 'info' } | null>(null);

  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [detailViewPlaceholder, setDetailViewPlaceholder] = useState<string | null>(null);
  const [isClosingDetail, setIsClosingDetail] = useState(false);
  const [eventToEdit, setEventToEdit] = useState<Event | null>(null);
  const [isAddEventModalOpen, setAddEventModalOpen] = useState(false);
  const [isManageTagsModalOpen, setManageTagsModalOpen] = useState(false);
  const [isManageSelectionTagsModalOpen, setIsManageSelectionTagsModalOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; event: Event } | null>(null);
  const [isStepsEditorOpen, setIsStepsEditorOpen] = useState(false);
  const [eventForStepsEditor, setEventForStepsEditor] = useState<Event | null>(null);
  const [confirmDeleteEventId, setConfirmDeleteEventId] = useState<string | null>(null);
  const [isFormatConfirmModalOpen, setFormatConfirmModalOpen] = useState(false);
  
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [confirmDeleteSelection, setConfirmDeleteSelection] = useState(false);

  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDescription, setNewEventDescription] = useState('');
  const [newEventImage, setNewEventImage] = useState<string | null>(null);
  const [newEventOriginalImage, setNewEventOriginalImage] = useState<File | null>(null);
  const [newEventTags, setNewEventTags] = useState<string[]>([]);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({ status: 'all', tags: [] });
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('createdAt-desc');
  
  // Settings State
  const [isWelcomeModalOpen, setIsWelcomeModalOpen] = useState(false);
  const [isSettingsModalOpen, setSettingsModalOpen] = useState(false);
  const [isDbManagerOpen, setIsDbManagerOpen] = useState(false);
  const [isCreateDbModalOpen, setIsCreateDbModalOpen] = useState(false);
  const [newDbNameInput, setNewDbNameInput] = useState('');
  const [dbToDelete, setDbToDelete] = useState<string | null>(null);
  const [confirmDiscardChanges, setConfirmDiscardChanges] = useState<string | null>(null);

  const [cardDensity, setCardDensity] = useState(75);
  const [collapseCardImages, setCollapseCardImages] = useState(false);
  const [overviewBlockSize, setOverviewBlockSize] = useState<OverviewBlockSize>('md');
  const [isDeveloperMode, setIsDeveloperMode] = useState(false);

  const [isFilterBarExpanded, setIsFilterBarExpanded] = useState(false);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  
  const [fabMode, setFabMode] = useState<'add' | 'toTop'>('add');
  const lastScrollY = useRef(0);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const detailScrollRef = useRef<HTMLElement>(null);

  const headerRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    title: string;
    message: string;
    onConfirm?: () => void;
  } | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');

  const isTempStorageMode = activeDbName === TEMP_STORAGE_DB_NAME_EXPORT;
  const isSelectionMode = selectedEventIds.size > 0;

  const showActionNotification = (message: string) => {
    const id = Date.now();
    setActionNotification({ id, message });
    setTimeout(() => {
        setActionNotification(prev => (prev?.id === id ? null : prev));
    }, 3000);
  };

  const applyPendingActions = (baseEvents: Event[], baseTags: string[], actions: PendingAction[]): { processedEvents: Event[], processedTags: string[] } => {
    let processedEvents = [...baseEvents];
    let processedTags = [...baseTags];
    
    actions.forEach(action => {
        switch (action.type) {
            case 'ADD_EVENT': if (!processedEvents.some(e => e.id === action.payload.event.id)) processedEvents = [action.payload.event, ...processedEvents]; break;
            case 'UPDATE_EVENT': processedEvents = processedEvents.map(e => e.id === action.payload.event.id ? action.payload.event : e); break;
            case 'DELETE_EVENT': processedEvents = processedEvents.filter(e => e.id !== action.payload); break;
            case 'UPDATE_EVENT_STEPS': processedEvents = processedEvents.map(e => e.id === action.payload.eventId ? { ...e, steps: action.payload.steps } : e); break;
            case 'ADD_TAG': if (!processedTags.includes(action.payload)) processedTags = [...processedTags, action.payload]; break;
            case 'DELETE_TAGS': const deleteSet = new Set(action.payload); processedTags = processedTags.filter(t => !deleteSet.has(t)); processedEvents = processedEvents.map(e => ({ ...e, tags: e.tags?.filter(t => !deleteSet.has(t)) })); break;
            case 'RENAME_TAG': const { oldTag, newTag } = action.payload; processedTags = processedTags.map(t => t === oldTag ? newTag : t); processedEvents = processedEvents.map(e => ({...e, tags: e.tags?.map(t => t === oldTag ? newTag : t)})); break;
            case 'REORDER_TAGS': processedTags = action.payload; break;
        }
    });
    return { processedEvents, processedTags };
  };

  const saveDataToDb = async (dbName: string, eventsToSave: Event[], tagsToSave: string[], templatesToSave: StepTemplate[], setsToSave: StepSetTemplate[]) => {
      if (dbName === DEMO_DB_NAME || dbName === TEMP_STORAGE_DB_NAME_EXPORT) return;
      await Promise.all([
          saveDataInStore(dbName, STORES.events, eventsToSave),
          saveTagsInStore(dbName, tagsToSave),
          saveDataInStore(dbName, STORES.stepTemplates, templatesToSave),
          saveDataInStore(dbName, STORES.stepSetTemplates, setsToSave),
      ]);
  };


  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useLayoutEffect(() => {
    const element = headerRef.current;
    if (!element) return;
    
    setHeaderHeight(element.offsetHeight);

    const observer = new ResizeObserver(() => {
      setHeaderHeight(element.offsetHeight);
    });
    observer.observe(element);
    
    return () => observer.disconnect();
  }, []);


  const handleScroll = useCallback((e: globalThis.Event) => {
    const target = e.currentTarget as HTMLElement;
    const currentScrollY = target.scrollTop;
    
    const newDirection = currentScrollY > lastScrollY.current && currentScrollY > 50 ? 'down' : 'up';
    
    const newFabMode = newDirection === 'down' && currentScrollY > 300 ? 'toTop' : 'add';
    setFabMode(newFabMode);

    lastScrollY.current = currentScrollY;

  }, []);

  useEffect(() => {
    lastScrollY.current = 0;
    setFabMode('add');

    const listEl = listScrollRef.current;
    const detailEl = detailScrollRef.current;

    if (listEl) {
        listEl.addEventListener('scroll', handleScroll, { passive: true });
    }
    if (detailEl) {
        detailEl.addEventListener('scroll', handleScroll, { passive: true });
    }

    return () => {
      if (listEl) {
          listEl.removeEventListener('scroll', handleScroll);
      }
      if (detailEl) {
          detailEl.removeEventListener('scroll', handleScroll);
      }
    };
  }, [handleScroll, selectedEvent, isLoading]);
  
  const loadData = useCallback(async (dbToLoad: string): Promise<{
    events: Event[], 
    tags: string[], 
    stepTemplates: StepTemplate[], 
    stepSetTemplates: StepSetTemplate[],
  }> => {
    try {
      if (dbToLoad === DEMO_DB_NAME) {
          return {
              events: demoEvents.map(e => JSON.parse(JSON.stringify(e))),
              tags: JSON.parse(JSON.stringify(demoTags)),
              stepTemplates: JSON.parse(JSON.stringify(demoStepTemplates)),
              stepSetTemplates: JSON.parse(JSON.stringify(demoStepSetTemplates)),
          };
      } 
      
      await initDB(dbToLoad);
      const isSeeded = await getMetadata(dbToLoad, 'isSeeded');

      if (!isSeeded && dbToLoad === DEFAULT_DB_NAME) {
          const startupEvents = [tutorialEvent];
          const startupTags = ['教程'];
          await Promise.all([
            saveDataInStore(dbToLoad, STORES.events, startupEvents),
            saveTagsInStore(dbToLoad, startupTags),
            saveDataInStore(dbToLoad, STORES.stepTemplates, []),
            saveDataInStore(dbToLoad, STORES.stepSetTemplates, []),
          ]);
          await saveMetadata(dbToLoad, 'isSeeded', true);
           return { events: startupEvents, tags: startupTags, stepTemplates: [], stepSetTemplates: [] };
      } else if (!isSeeded) {
          await Promise.all([
            saveDataInStore(dbToLoad, STORES.events, []),
            saveTagsInStore(dbToLoad, []),
            saveDataInStore(dbToLoad, STORES.stepTemplates, []),
            saveDataInStore(dbToLoad, STORES.stepSetTemplates, []),
          ]);
          await saveMetadata(dbToLoad, 'isSeeded', true);
           return { events: [], tags: [], stepTemplates: [], stepSetTemplates: [] };
      }
      
      const [dbEvents, dbTags, dbStepTemplates, dbStepSetTemplates] = await Promise.all([
        getAllDataFromStore<Event>(dbToLoad, STORES.events),
        getTagsFromStore(dbToLoad),
        getAllDataFromStore<StepTemplate>(dbToLoad, STORES.stepTemplates),
        getAllDataFromStore<StepSetTemplate>(dbToLoad, STORES.stepSetTemplates),
      ]);
      return { events: dbEvents, tags: dbTags, stepTemplates: dbStepTemplates, stepSetTemplates: dbStepSetTemplates };

    } catch (error) {
      console.error("加载数据失败:", error);
      throw error;
    }
  }, []);

  const discoverDatabases = useCallback(async (): Promise<string[]> => {
    if (!indexedDB.databases) {
      console.warn("indexedDB.databases() is not supported.");
      return [];
    }
    try {
      const dbs = await indexedDB.databases();
      const names = dbs
        .filter(db => db.name?.startsWith(DB_PREFIX) && db.name !== SETTINGS_DB_NAME)
        .map(db => db.name!);
      return names;
    } catch (e) {
      console.error("Could not list IndexedDB databases.", e);
      return [];
    }
  }, []);
  
  const loadGlobalSettings = async () => {
    try {
        await initDB(SETTINGS_DB_NAME);
        const [dbCardDensity, dbCollapseImages, dbOverviewBlockSize, dbDeveloperMode] = await Promise.all([
            getMetadata(SETTINGS_DB_NAME, 'cardDensity').catch(() => null),
            getMetadata(SETTINGS_DB_NAME, 'collapseCardImages').catch(() => null),
            getMetadata(SETTINGS_DB_NAME, 'overviewBlockSize').catch(() => null),
            getMetadata(SETTINGS_DB_NAME, 'developerMode').catch(() => null),
        ]);
        setCardDensity(dbCardDensity ?? 75);
        setCollapseCardImages(dbCollapseImages ?? false);
        setOverviewBlockSize(dbOverviewBlockSize ?? 'md');
        setIsDeveloperMode(dbDeveloperMode ?? false);
    } catch (error) {
        console.warn("加载全局设置失败:", error);
        // Set defaults if loading fails
        setCardDensity(75);
        setCollapseCardImages(false);
        setOverviewBlockSize('md');
        setIsDeveloperMode(false);
    }
  };

  useEffect(() => {
    const initializeApp = async () => {
        setIsLoading(true);
        setDbError(null);

        // Check for welcome modal first
        const hasSeenWelcome = localStorage.getItem('hasSeenWelcomeModal') === 'true';
        if (!hasSeenWelcome) {
          setIsWelcomeModalOpen(true);
        }

        // Load global settings first, from their dedicated DB. This runs for all modes.
        await loadGlobalSettings();

        const hasLaunchedBefore = localStorage.getItem('hasLaunchedBefore') === 'true';
        let detectedDbNames = await discoverDatabases();
        let activeDb: string;

        if (!hasLaunchedBefore) {
            activeDb = DEFAULT_DB_NAME;
            if (!detectedDbNames.includes(DEFAULT_DB_NAME)) {
                detectedDbNames = [DEFAULT_DB_NAME, ...detectedDbNames];
            }
            localStorage.setItem('activeDbName', activeDb);
            localStorage.setItem('hasLaunchedBefore', 'true');
        } else if (detectedDbNames.length === 0) {
            activeDb = TEMP_STORAGE_DB_NAME_EXPORT;
            localStorage.removeItem('activeDbName');
        } else {
            let storedActiveDb = localStorage.getItem('activeDbName');
            if (!storedActiveDb || !detectedDbNames.includes(storedActiveDb)) {
                activeDb = detectedDbNames.find(name => name === DEFAULT_DB_NAME) || detectedDbNames[0];
                localStorage.setItem('activeDbName', activeDb);
            } else {
                activeDb = storedActiveDb;
            }
        }
        
        setUserDbNames(detectedDbNames);
        setActiveDbName(activeDb);

        if (activeDb === TEMP_STORAGE_DB_NAME_EXPORT) {
            setEvents([]);
            setCustomTags([]);
            setStepTemplates([]);
            setStepSetTemplates([]);
            setDbStatus({ id: Date.now(), message: '无数据库。更改将是临时的。', type: 'info' });
            setIsLoading(false);
            return;
        }
        
        try {
            const data = await loadData(activeDb);
            let finalEvents = data.events.map(reviveEventDates);
            let finalTags = data.tags;

            if (pendingActions.length > 0) {
                const { processedEvents, processedTags } = applyPendingActions(finalEvents, finalTags, pendingActions);
                finalEvents = processedEvents;
                finalTags = processedTags;
                await saveDataToDb(activeDb, finalEvents, finalTags, data.stepTemplates, data.stepSetTemplates);
                setPendingActions([]);
                showActionNotification('临时更改已成功保存。');
            }
            
            setEvents(finalEvents);
            setCustomTags(finalTags);
            setStepTemplates(data.stepTemplates);
            setStepSetTemplates(data.stepSetTemplates);
        } catch (error) {
            console.error("加载数据库失败:", error);
            setDbError(error as Error);
            setEvents([]);
            setCustomTags([]);
            setDbStatus({
                id: Date.now(),
                message: '数据库加载失败。更改将临时保存。',
                type: 'error',
            });
        } finally {
            setIsLoading(false);
        }
    };
    initializeApp();
  }, []);


  // Sync logic
  useEffect(() => {
    if (isLoading || isTempStorageMode || dbError || pendingActions.length === 0) {
      if (!isLoading && !isTempStorageMode && !dbError && dbStatus?.message === '正在连接数据库...') {
        setDbStatus(null);
      }
      return;
    }

    const performSync = async () => {
        setDbStatus({ id: Date.now(), message: `正在同步 ${pendingActions.length} 项更改...`, type: 'loading' });

        const { processedEvents, processedTags } = applyPendingActions(events, customTags, pendingActions);
        
        try {
            if (activeDbName !== DEMO_DB_NAME) {
                 await Promise.all([
                    saveDataInStore(activeDbName, STORES.events, processedEvents),
                    saveTagsInStore(activeDbName, processedTags),
                    ...pendingActions.map(action => {
                        if (action.type === 'ADD_EVENT' && action.payload.originalImage) {
                            return saveDataInStoreByKey(activeDbName, STORES.originalImages, action.payload.originalImage, action.payload.event.id);
                        }
                        if (action.type === 'UPDATE_EVENT' && action.payload.originalImage) {
                            if (action.payload.originalImage === 'remove') {
                                return deleteDataFromStoreByKey(activeDbName, STORES.originalImages, action.payload.event.id);
                            }
                            return saveDataInStoreByKey(activeDbName, STORES.originalImages, action.payload.originalImage, action.payload.event.id);
                        }
                        if (action.type === 'DELETE_EVENT') {
                            return deleteDataFromStoreByKey(activeDbName, STORES.originalImages, action.payload);
                        }
                        return Promise.resolve();
                    })
                ]);
            }
           
            setEvents(processedEvents);
            setCustomTags(processedTags);
            setPendingActions([]);
            setDbError(null);

            setDbStatus({ id: Date.now(), message: '同步完成!', type: 'success' });

        } catch(error) {
            console.error("同步失败:", error);
            setDbError(error as Error);
            setDbStatus({ id: Date.now(), message: '同步失败！更改未被保存。', type: 'error' });
            // Do NOT clear pendingActions on failure
        }
    };
    
    const syncTimer = setTimeout(performSync, 500);
    return () => clearTimeout(syncTimer);
  }, [isLoading, pendingActions, events, customTags, activeDbName, isTempStorageMode, dbError]);

    // beforeunload listener for unsaved changes on sync failure
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = '您有未保存的更改。确定要离开吗？';
        };

        if (dbError && pendingActions.length > 0) {
            window.addEventListener('beforeunload', handleBeforeUnload);
        }

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [dbError, pendingActions]);


  const saveData = useCallback(async () => {
    // Save application data (events, tags, etc.)
    if (!isLoading && activeDbName && !isTempStorageMode && activeDbName !== DEMO_DB_NAME) {
        try {
            await Promise.all([
                saveDataInStore(activeDbName, STORES.events, events),
                saveTagsInStore(activeDbName, customTags),
                saveDataInStore(activeDbName, STORES.stepTemplates, stepTemplates),
                saveDataInStore(activeDbName, STORES.stepSetTemplates, stepSetTemplates),
            ]);
        } catch (error) {
            console.error("保存应用数据失败:", error);
        }
    }
    // Save global settings to their dedicated database, regardless of mode.
    try {
        await Promise.all([
            saveMetadata(SETTINGS_DB_NAME, 'cardDensity', cardDensity),
            saveMetadata(SETTINGS_DB_NAME, 'collapseCardImages', collapseCardImages),
            saveMetadata(SETTINGS_DB_NAME, 'overviewBlockSize', overviewBlockSize),
            saveMetadata(SETTINGS_DB_NAME, 'developerMode', isDeveloperMode),
        ]);
    } catch (error) {
        console.error("保存设置失败:", error);
    }
  }, [isLoading, activeDbName, events, customTags, stepTemplates, stepSetTemplates, cardDensity, collapseCardImages, overviewBlockSize, isDeveloperMode, isTempStorageMode]);

  useEffect(() => {
    if (pendingActions.length > 0) return;
    const timer = setTimeout(() => {
      saveData();
    }, 500);
    return () => clearTimeout(timer);
  }, [saveData, pendingActions]);
  

  // Centralized effect to handle auto-dismissing snackbars
  useEffect(() => {
    let timer: number | undefined;

    if (!dbStatus) {
        return;
    }

    const isMobile = windowWidth < 768;
    // Auto-dismiss logic:
    // - 'success' messages are always dismissed.
    // - 'error' and 'info' messages are dismissed only on mobile.
    // - 'loading' messages are never dismissed automatically.
    const shouldTimeout = 
        dbStatus.type === 'success' || 
        (isMobile && (dbStatus.type === 'error' || dbStatus.type === 'info'));

    if (shouldTimeout) {
        const duration = dbStatus.type === 'success' ? 2500 : 5000; // Longer duration for important info on mobile
        timer = window.setTimeout(() => {
            // Only clear if the status hasn't changed in the meantime
            setDbStatus(prev => (prev?.id === dbStatus.id ? null : prev));
        }, duration);
    }

    return () => {
        if (timer) {
            clearTimeout(timer);
        }
    };
  }, [dbStatus, windowWidth]);
  
  const handleStatusFilterChange = (status: 'all' | 'in-progress' | 'completed') => {
    setActiveFilters(prev => ({ ...prev, status }));
  };

  const handleTagFilterChange = (tag: string) => {
    setActiveFilters(prev => {
      const newTags = new Set(prev.tags);
      if (newTags.has(tag)) newTags.delete(tag);
      else newTags.add(tag);
      return { ...prev, tags: Array.from(newTags) };
    });
  };

  const handleResetTagFilters = () => {
    setActiveFilters(prev => ({ ...prev, tags: [] }));
  };

  const filteredEvents = useMemo(() => {
    let processedEvents = [...events];
    if (searchQuery.trim() !== '') {
      const lowercasedQuery = searchQuery.toLowerCase();
      processedEvents = processedEvents.filter(event =>
        event.title.toLowerCase().includes(lowercasedQuery) ||
        event.description.toLowerCase().includes(lowercasedQuery)
      );
    }
    if (activeFilters.status !== 'all') {
      processedEvents = processedEvents.filter(event => {
        const totalSteps = event.steps.length;
        if (totalSteps === 0) return activeFilters.status === 'in-progress';
        const completedSteps = event.steps.filter(step => step.completed).length;
        if (activeFilters.status === 'in-progress') return completedSteps < totalSteps;
        if (activeFilters.status === 'completed') return completedSteps === totalSteps;
        return false;
      });
    }
    if (activeFilters.tags.length > 0) {
      processedEvents = processedEvents.filter(event =>
        activeFilters.tags.every(tag => event.tags?.includes(tag))
      );
    }
    const getProgress = (event: Event) => {
      if (event.steps.length === 0) return 0;
      return (event.steps.filter(s => s.completed).length / event.steps.length) * 100;
    };
    return [...processedEvents].sort((a, b) => {
      switch (sortOrder) {
        case 'createdAt-asc': return a.createdAt.getTime() - b.createdAt.getTime();
        case 'title-asc': return a.title.localeCompare(b.title);
        case 'title-desc': return b.title.localeCompare(a.title);
        case 'progress-asc': return getProgress(a) - b.createdAt.getTime();
        case 'progress-desc': return getProgress(b) - getProgress(a);
        default: return b.createdAt.getTime() - a.createdAt.getTime();
      }
    });
  }, [events, activeFilters, searchQuery, sortOrder]);

  const gridConfig = useMemo(() => {
    // This logic is explicitly designed to match the discrete options in SettingsModal.
    let numColumns;
    if (windowWidth >= 1280) { // Desktop
      if (cardDensity >= 95) numColumns = 5;
      else if (cardDensity >= 68) numColumns = 4;
      else if (cardDensity >= 40) numColumns = 3;
      else if (cardDensity >= 20) numColumns = 2;
      else numColumns = 1;
    } else if (windowWidth >= 768) { // Tablet
      if (cardDensity >= 85) numColumns = 4;
      else if (cardDensity >= 55) numColumns = 3;
      else if (cardDensity >= 25) numColumns = 2;
      else numColumns = 1;
    } else { // Mobile
      if (cardDensity >= 50) numColumns = 2;
      else numColumns = 1;
    }
    return { numColumns };
  }, [cardDensity, windowWidth]);

  const handleSelectEvent = (event: Event) => {
    setSelectedEvent(event);
    setDetailViewPlaceholder(null);
  };

  const handleBackToList = () => {
    setIsClosingDetail(true);
    setTimeout(() => { 
        setSelectedEvent(null); 
        setIsClosingDetail(false);
        setDetailViewPlaceholder(null);
    }, 300);
  };
  
  const handleUpdateEvent = (updatedEvent: Event, originalImage?: File | 'remove') => {
    const isImageChanged = originalImage || updatedEvent.imageUrl !== eventToEdit?.imageUrl;
    const finalEvent = {
        ...updatedEvent,
        hasOriginalImage: isImageChanged ? originalImage instanceof File : (eventToEdit?.hasOriginalImage || false),
    };

    // Add new tags to global list
    const updatedTags = finalEvent.tags || [];
    const newTagsToCreate = updatedTags.filter(tag => !customTags.includes(tag));
    newTagsToCreate.forEach(tag => handleAddTag(tag));
    if (newTagsToCreate.length > 0) {
        const tempMessage = (isLoading || isTempStorageMode || dbError) ? ' (已临时保存)' : '';
        showActionNotification(`已添加新标签: ${newTagsToCreate.join(', ')}${tempMessage}`);
    }

    if (isLoading || isTempStorageMode || dbError) {
        setEvents(prev => prev.map(e => e.id === finalEvent.id ? finalEvent : e));
        setPendingActions(prev => [...prev.filter(a => !(a.type === 'UPDATE_EVENT' && a.payload.event.id === finalEvent.id)), { type: 'UPDATE_EVENT', payload: { event: finalEvent, originalImage } }]);
        showActionNotification('更新已临时保存');
    } else {
        setEvents(events.map(e => e.id === finalEvent.id ? finalEvent : e));
         if (originalImage instanceof File) {
            saveDataInStoreByKey(activeDbName, STORES.originalImages, originalImage, finalEvent.id);
        } else if (originalImage === 'remove') {
            deleteDataFromStoreByKey(activeDbName, STORES.originalImages, finalEvent.id);
        }
    }
    if (selectedEvent?.id === finalEvent.id) {
        setSelectedEvent(finalEvent);
        setDetailViewPlaceholder(null);
    }
    if(eventToEdit?.id === finalEvent.id) setEventToEdit(null);
    if (eventForStepsEditor?.id === finalEvent.id) setEventForStepsEditor(finalEvent);
  };

  const handleUpdateEventSteps = (eventId: string, newSteps: ProgressStep[]) => {
      const updateLogic = (prevEvents: Event[]) => {
          return prevEvents.map(e => {
              if (e.id === eventId) {
                  const updatedEvent = { ...e, steps: newSteps };
                  if (selectedEvent?.id === eventId) setSelectedEvent(updatedEvent);
                  if (eventForStepsEditor?.id === eventId) setEventForStepsEditor(updatedEvent);
                  return updatedEvent;
              }
              return e;
          });
      };
      if (isLoading || isTempStorageMode || dbError) {
          setEvents(updateLogic);
          setPendingActions(prev => [...prev.filter(a => !(a.type === 'UPDATE_EVENT_STEPS' && a.payload.eventId === eventId)), { type: 'UPDATE_EVENT_STEPS', payload: { eventId, steps: newSteps } }]);
          showActionNotification('步骤更新已临时保存');
      } else {
          setEvents(updateLogic);
      }
  };

  const handleImageSelected = async (file: File | null) => {
    setNewEventOriginalImage(file);
    if (file?.type.startsWith('image/')) {
      setIsProcessingImage(true);
      try {
        const resizedImage = await resizeImage(file, { maxWidth: 1920, maxHeight: 1080, quality: 0.8 });
        setNewEventImage(resizedImage);
      } catch (error) {
        console.error("图片处理失败", error);
        setNotification({
          type: 'error',
          title: '图片处理失败',
          message: '无法处理您选择的图片文件。请尝试其他图片。'
        });
        setNewEventOriginalImage(null);
      } finally {
        setIsProcessingImage(false);
      }
    } else {
        setNewEventImage(null);
    }
  };

  const closeAddEventModal = () => {
    setNewEventTitle(''); setNewEventDescription(''); setNewEventImage(null); setNewEventTags([]); setNewEventOriginalImage(null);
    setAddEventModalOpen(false);
  };

  const handleAddTag = (tag: string) => {
    if (!customTags.includes(tag)) {
        if (isLoading || isTempStorageMode || dbError) {
            setCustomTags(prev => [...prev, tag]);
            setPendingActions(prev => [...prev, { type: 'ADD_TAG', payload: tag }]);
            // showActionNotification('标签已临时添加');
        } else {
            setCustomTags(prev => [...prev, tag]);
        }
    }
  };

  const handleAddEvent = () => {
    if (newEventTitle.trim() === '' || isProcessingImage) return;

    // Add new tags to global list
    const newTagsToCreate = newEventTags.filter(tag => !customTags.includes(tag));
    newTagsToCreate.forEach(tag => handleAddTag(tag));
    if (newTagsToCreate.length > 0) {
      const tempMessage = (isLoading || isTempStorageMode || dbError) ? ' (已临时保存)' : '';
      showActionNotification(`已添加新标签: ${newTagsToCreate.join(', ')}${tempMessage}`);
    }

    const newEvent: Event = {
        id: `event-${Date.now()}`, title: newEventTitle, description: newEventDescription,
        createdAt: new Date(), steps: [], imageUrl: newEventImage || undefined, tags: newEventTags,
        hasOriginalImage: !!newEventOriginalImage,
    };
    if (isLoading || isTempStorageMode || dbError) {
        setEvents(prev => [newEvent, ...prev]);
        setPendingActions(prev => [...prev, { type: 'ADD_EVENT', payload: { event: newEvent, originalImage: newEventOriginalImage || undefined } }]);
        showActionNotification('事件已临时保存');
    } else {
        setEvents([newEvent, ...events]);
        if (newEventOriginalImage) {
            saveDataInStoreByKey(activeDbName, STORES.originalImages, newEventOriginalImage, newEvent.id);
        }
    }
    closeAddEventModal();
  };
  
  const handleDeleteTags = (tagsToDelete: string[]) => {
    const deleteSet = new Set(tagsToDelete);
    const updateState = (currentEvents: Event[], currentTags: string[]) => {
        const newTags = currentTags.filter(t => !deleteSet.has(t));
        const newEvents = currentEvents.map(e => ({ ...e, tags: e.tags?.filter(t => !deleteSet.has(t)) }));
        return { newEvents, newTags };
    };
    if (isLoading || isTempStorageMode || dbError) {
        const { newEvents, newTags } = updateState(events, customTags);
        setEvents(newEvents);
        setCustomTags(newTags);
        setPendingActions(prev => [...prev, { type: 'DELETE_TAGS', payload: tagsToDelete }]);
        showActionNotification('标签删除已暂存');
    } else {
        const { newEvents, newTags } = updateState(events, customTags);
        setEvents(newEvents);
        setCustomTags(newTags);
    }
    setActiveFilters(prev => ({ ...prev, tags: prev.tags.filter(t => !deleteSet.has(t)) }));
  };

  const handleRenameTag = (oldTag: string, newTag: string): boolean => {
    if (newTag.trim() === '' || (customTags.includes(newTag) && newTag !== oldTag)) {
        return false;
    }
    const updateState = (currentEvents: Event[], currentTags: string[]) => {
        const newTags = currentTags.map(t => t === oldTag ? newTag : t);
        const newEvents = currentEvents.map(e => ({ ...e, tags: e.tags?.map(t => t === oldTag ? newTag : t) }));
        return { newEvents, newTags };
    };

    if (isLoading || isTempStorageMode || dbError) {
        const { newEvents, newTags } = updateState(events, customTags);
        setEvents(newEvents);
        setCustomTags(newTags);
        setPendingActions(prev => [...prev, { type: 'RENAME_TAG', payload: { oldTag, newTag } }]);
        showActionNotification('标签重命名已暂存');
    } else {
        const { newEvents, newTags } = updateState(events, customTags);
        setEvents(newEvents);
        setCustomTags(newTags);
    }
    setActiveFilters(prev => ({ ...prev, tags: prev.tags.map(t => t === oldTag ? newTag : t) }));
    return true;
  };

  const handleReorderTags = (reorderedTags: string[]) => {
    if (isLoading || isTempStorageMode || dbError) {
        setCustomTags(reorderedTags);
        setPendingActions(prev => [...prev, { type: 'REORDER_TAGS', payload: reorderedTags }]);
        showActionNotification('标签排序已暂存');
    } else {
        setCustomTags(reorderedTags);
    }
  };

  const handleOpenContextMenu = (position: { x: number; y: number }, event: Event) => setContextMenu({ ...position, event });
  const handleCloseContextMenu = () => setContextMenu(null);

  const handleDeleteEvent = (eventId: string) => {
    if (isLoading || isTempStorageMode || dbError) {
        setEvents(prev => prev.filter(e => e.id !== eventId));
        setPendingActions(prev => [...prev, { type: 'DELETE_EVENT', payload: eventId }]);
        showActionNotification('删除操作已暂存');
    } else {
        setEvents(prev => prev.filter(e => e.id !== eventId));
        deleteDataFromStoreByKey(activeDbName, STORES.originalImages, eventId);
    }
    if (selectedEvent?.id === eventId) {
        setSelectedEvent(null);
        setDetailViewPlaceholder('您正在查看的事件已被删除。');
    }
  };

  const handleOpenStepsEditor = (event: Event) => {
    setEventForStepsEditor(event); setIsStepsEditorOpen(true);
  };
  
  const handleExportData = async () => {
    if (activeDbName === DEMO_DB_NAME && !isTempStorageMode) {
        setNotification({ type: 'error', title: '导出受限', message: '无法导出演示数据库。' });
        return;
    }
    try {
        let exportDataPayload;
        if (isTempStorageMode || dbError) {
             exportDataPayload = {
                events: events,
                tags: customTags,
                stepTemplates: stepTemplates,
                stepSetTemplates: stepSetTemplates
            };
        } else {
            const [eventsData, tagsData, stepTemplatesData, stepSetTemplatesData] = await Promise.all([
                getAllDataFromStore<Event>(activeDbName, STORES.events),
                getTagsFromStore(activeDbName),
                getAllDataFromStore<StepTemplate>(activeDbName, STORES.stepTemplates),
                getAllDataFromStore<StepSetTemplate>(activeDbName, STORES.stepSetTemplates),
            ]);
            exportDataPayload = { events: eventsData, tags: tagsData, stepTemplates: stepTemplatesData, stepSetTemplates: stepSetTemplatesData };
        }

        const exportData = { version: 1, exportedAt: new Date().toISOString(), data: exportDataPayload };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        const dbNameToExport = isTempStorageMode ? 'temp-session' : activeDbName.replace(`${DB_PREFIX}-`, '');
        a.download = `essenmelia_backup_${dbNameToExport}_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
        a.remove();
        setNotification({ type: 'success', title: '导出成功', message: '您的数据已开始下载。' });
    } catch (error) {
        setNotification({ type: 'error', title: '导出失败', message: `导出数据时发生错误: ${error instanceof Error ? error.message : '未知错误'}` });
    }
  };

  const handleImportRequest = (file: File) => {
     if (activeDbName === DEMO_DB_NAME && !isTempStorageMode) {
        setNotification({ type: 'error', title: '导入受限', message: '无法向演示数据库导入数据。' });
        return;
    }
    setImportFile(file);
  };

  const executeImport = async () => {
    if (!importFile) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const importedJson = JSON.parse(e.target?.result as string);
            const { events: iEvents, tags: iTags, stepTemplates: iStepT, stepSetTemplates: iStepSetT } = importedJson.data;
            if (!iEvents || !iTags || !iStepT || !iStepSetT) throw new Error("文件格式无效。");
            setImportFile(null);

            // Regenerate all IDs to prevent any conflicts with existing data.
            const generateNewId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

            const newEvents = iEvents.map((event: Event) => ({
                ...event,
                id: generateNewId('event'),
                // Set creation date to now, making it clear it's newly imported.
                createdAt: new Date(),
                steps: event.steps.map(step => ({
                    ...step,
                    id: generateNewId('step'),
                    // Reset timestamps to avoid confusion with old dates.
                    timestamp: new Date(),
                }))
            }));

            const newStepTemplates = iStepT.map((template: StepTemplate) => ({
                 ...template,
                 id: generateNewId('template'),
            }));

            const newStepSetTemplates = iStepSetT.map((set: StepSetTemplate) => ({
                ...set,
                id: generateNewId('set'),
                steps: set.steps.map(step => ({
                    ...step,
                    id: generateNewId('set-step'),
                }))
            }));
            
            const newTags = iTags; // Tags are strings, no IDs.

            // Merge new data with existing data.
            const mergedEvents = [...events, ...newEvents.map(reviveEventDates)];
            const mergedTags = [...new Set([...customTags, ...newTags])];
            const mergedStepTemplates = [...stepTemplates, ...newStepTemplates];
            const mergedStepSetTemplates = [...stepSetTemplates, ...newStepSetTemplates];

            if (isTempStorageMode || dbError) {
                // In a temporary state, just update the local state with merged data.
                setEvents(mergedEvents);
                setCustomTags(mergedTags);
                setStepTemplates(mergedStepTemplates);
                setStepSetTemplates(mergedStepSetTemplates);
                setNotification({ type: 'success', title: '数据已添加', message: '数据已成功添加到您的临时会话中。', onConfirm: () => setIsDbManagerOpen(false) });
            } else {
                // For a regular DB, insert the new items into IndexedDB.
                await Promise.all([
                    insertDataInStore(activeDbName, STORES.events, newEvents),
                    insertDataInStore(activeDbName, STORES.stepTemplates, newStepTemplates),
                    insertDataInStore(activeDbName, STORES.stepSetTemplates, newStepSetTemplates),
                    saveTagsInStore(activeDbName, mergedTags), // Overwrite tags with the full merged list.
                ]);

                // Update component state to reflect the merged data.
                setEvents(mergedEvents);
                setCustomTags(mergedTags);
                setStepTemplates(mergedStepTemplates);
                setStepSetTemplates(mergedStepSetTemplates);
                
                setNotification({ type: 'success', title: '数据已添加', message: '数据已成功添加到当前数据库。', onConfirm: () => setIsDbManagerOpen(false) });
            }
        } catch (error) {
            setImportFile(null);
            setNotification({ type: 'error', title: '导入失败', message: `导入数据时发生错误: ${error instanceof Error ? error.message : '未知错误'}` });
        }
    };
    reader.readAsText(importFile);
  };
  
  const handleFormatApp = () => {
    setFormatConfirmModalOpen(false);

    if (isTempStorageMode) {
        setEvents([]);
        setCustomTags([]);
        setStepTemplates([]);
        setStepSetTemplates([]);
        setPendingActions([]);
        setNotification({ type: 'success', title: '会话已重置', message: '您的临时会话已重置为初始状态。' });
        return;
    }

    dbConnections.forEach(conn => conn.close());
    dbConnections.clear();

    const dbNamesToDelete = [...new Set([SETTINGS_DB_NAME, DEMO_DB_NAME, ...userDbNames])];
    const deletePromises = dbNamesToDelete.map(name => new Promise<void>((resolve, reject) => {
        const req = indexedDB.deleteDatabase(name);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        req.onblocked = () => {
          console.warn(`数据库 ${name} 删除被阻止。请关闭其他标签页后再试。`);
          resolve(); 
        };
    }));

    Promise.all(deletePromises)
      .then(() => {
        localStorage.clear();
        setNotification({ type: 'success', title: '格式化成功', message: '所有数据已被清除。应用将重新加载。', onConfirm: () => window.location.reload() });
      })
      .catch(error => {
        console.error("格式化失败:", error);
        setNotification({ type: 'error', title: '格式化失败', message: `格式化时发生错误: ${error instanceof Error ? error.message : '未知错误'}` });
      });
  };

  const getDisplayName = (fullName: string) => {
    if (fullName === DEFAULT_DB_NAME_EXPORT) return '我的数据库';
    if (fullName === DEMO_DB_NAME_EXPORT) return '演示数据库';
    if (fullName === TEMP_STORAGE_DB_NAME_EXPORT) return '临时存储';
    return fullName.replace(`${DB_PREFIX}-`, '');
  };

  const executeDiscardAndSwitch = async (targetDbName: string) => {
    setConfirmDiscardChanges(null);
    setPendingActions([]);
    setDbError(null);
    setSelectedEvent(null);
    setDetailViewPlaceholder(null);
    setActiveFilters({ status: 'all', tags: [] });
    setSearchQuery('');

    if (targetDbName === TEMP_STORAGE_DB_NAME_EXPORT) {
        setActiveDbName(TEMP_STORAGE_DB_NAME_EXPORT);
        setEvents([]);
        setCustomTags([]);
        setStepTemplates([]);
        setStepSetTemplates([]);
        setDbStatus({ id: Date.now(), message: '已进入临时模式。切换数据库将丢失当前更改。', type: 'info' });
    } else if (targetDbName === DEMO_DB_NAME) {
        setDbStatus({ id: Date.now(), message: `正在连接到 ${getDisplayName(targetDbName)}...`, type: 'loading' });
        try {
            const demoData = await loadData(DEMO_DB_NAME);
            setEvents(demoData.events.map(reviveEventDates));
            setCustomTags(demoData.tags);
            setStepTemplates(demoData.stepTemplates);
            setStepSetTemplates(demoData.stepSetTemplates);
            setActiveDbName(DEMO_DB_NAME);
            localStorage.setItem('activeDbName', DEMO_DB_NAME);
            setDbStatus({ id: Date.now(), message: '数据库切换成功！', type: 'success' });
        } catch (error) {
             console.error(`切换到数据库 ${targetDbName} 失败:`, error);
             setNotification({ type: 'error', title: '切换失败', message: '无法加载演示数据库。' });
             setDbStatus(null);
        }
    }
  };

  const handleSwitchDb = async (newDbName: string) => {
    if (newDbName === activeDbName) {
      setIsDbManagerOpen(false);
      return;
    }
    
    const cameFromPassiveTemp = dbError !== null;
    const hasUnsyncedChanges = pendingActions.length > 0;

    if ((newDbName === DEMO_DB_NAME || newDbName === TEMP_STORAGE_DB_NAME_EXPORT) && cameFromPassiveTemp && hasUnsyncedChanges) {
        setConfirmDiscardChanges(newDbName);
        setIsDbManagerOpen(false);
        return;
    }

    // SCENARIO 1: Switching TO active temporary storage from a working DB.
    if (newDbName === TEMP_STORAGE_DB_NAME_EXPORT) {
      setActiveDbName(TEMP_STORAGE_DB_NAME_EXPORT);
      localStorage.removeItem('activeDbName');
      setEvents([]);
      setCustomTags([]);
      setStepTemplates([]);
      setStepSetTemplates([]);
      setPendingActions([]);
      setDbError(null);
      setDbStatus({ id: Date.now(), message: '已进入临时模式。切换数据库将丢失当前更改。', type: 'info' });
      setIsDbManagerOpen(false);
      setActiveFilters({ status: 'all', tags: [] });
      setSearchQuery('');
      return;
    }
    
    // For all other cases, switching TO a regular DB.
    setDbStatus({ id: Date.now(), message: `正在连接到 ${getDisplayName(newDbName)}...`, type: 'loading' });
    setIsDbManagerOpen(false);
    setSelectedEvent(null);
    setDetailViewPlaceholder(null);

    try {
        let dataToSet;

        // SCENARIO 2: FROM passive temporary storage (error state), MERGE changes.
        if (cameFromPassiveTemp && hasUnsyncedChanges) {
            setDbStatus({ id: Date.now(), message: '正在合并临时更改...', type: 'loading' });

            const targetDbData = await loadData(newDbName);
            
            const { processedEvents, processedTags } = applyPendingActions(
                targetDbData.events.map(reviveEventDates),
                targetDbData.tags,
                pendingActions
            );
            
            await saveDataToDb(newDbName, processedEvents, processedTags, targetDbData.stepTemplates, targetDbData.stepSetTemplates);

            dataToSet = {
                events: processedEvents,
                tags: processedTags,
                stepTemplates: targetDbData.stepTemplates,
                stepSetTemplates: targetDbData.stepSetTemplates,
            };
            setDbStatus({ id: Date.now(), message: '临时更改已成功合并！', type: 'success' });

        } else {
            // SCENARIO 3: FROM a regular DB, just load new data.
            const loadedData = await loadData(newDbName);
            dataToSet = {
                events: loadedData.events.map(reviveEventDates),
                tags: loadedData.tags,
                stepTemplates: loadedData.stepTemplates,
                stepSetTemplates: loadedData.stepSetTemplates,
            };
            setDbStatus({ id: Date.now(), message: '数据库切换成功！', type: 'success' });
        }

        setEvents(dataToSet.events);
        setCustomTags(dataToSet.tags);
        setStepTemplates(dataToSet.stepTemplates);
        setStepSetTemplates(dataToSet.stepSetTemplates);
        
        setActiveDbName(newDbName);
        localStorage.setItem('activeDbName', newDbName);

        setDbError(null);
        setPendingActions([]);
        
        setActiveFilters({ status: 'all', tags: [] });
        setSearchQuery('');

    } catch (error) {
        console.error(`切换到数据库 ${newDbName} 失败:`, error);
        setDbError(error as Error); 
        setNotification({
            type: 'error',
            title: '数据库连接失败',
            message: `无法连接到数据库 "${getDisplayName(newDbName)}"。您的更改仍然是临时的。`,
        });
        setDbStatus(null);
        setIsDbManagerOpen(true);
    }
  };

  const handleCreateNewDb = async () => {
    const name = newDbNameInput.trim();
    if (!name) {
      setNotification({ type: 'error', title: '名称无效', message: '数据库名称不能为空。' });
      return;
    }
    const fullName = `${DB_PREFIX}-${name}`;
    if (userDbNames.includes(fullName) || name === 'demo') {
      setNotification({ type: 'error', title: '名称重复', message: '该名称的数据库已存在。' });
      return;
    }

    try {
      await initDB(fullName);

      const newDbNames = [...userDbNames, fullName];
      setUserDbNames(newDbNames);
      
      setIsCreateDbModalOpen(false);
      setNewDbNameInput('');

      setNotification({ type: 'success', title: '创建成功', message: `数据库 "${getDisplayName(fullName)}" 已创建。` });

    } catch (error) {
      console.error("创建数据库失败:", error);
      setNotification({ type: 'error', title: '创建失败', message: `创建数据库时发生错误: ${error instanceof Error ? error.message : '未知错误'}` });
    }
  };
  
  const handleDeleteDb = async () => {
    const nameToDelete = dbToDelete;
    if (!nameToDelete) return;

    setDbToDelete(null);

    const wasActive = nameToDelete === activeDbName;
    const newDbNames = userDbNames.filter(n => n !== nameToDelete);

    if (wasActive) {
        const nextDb = newDbNames.find(name => name === DEFAULT_DB_NAME) || newDbNames[0];
        if (nextDb) {
            await handleSwitchDb(nextDb);
        } else {
            // Last DB was deleted. Enter passive temporary mode with a clean slate.
            localStorage.removeItem('activeDbName'); 
            setActiveDbName(TEMP_STORAGE_DB_NAME_EXPORT);
            setEvents([]);
            setCustomTags([]);
            setStepTemplates([]);
            setStepSetTemplates([]);
            setPendingActions([]); // Clear orphaned pending actions
            setDbError(new Error("The last database was deleted."));
            setDbStatus({ id: Date.now(), message: '最后数据库已删除。您的更改现在是临时的。', type: 'info' });
        }
    }

    dbConnections.get(nameToDelete)?.close();
    dbConnections.delete(nameToDelete);

    const deleteReq = indexedDB.deleteDatabase(nameToDelete);
    deleteReq.onsuccess = () => {
        setUserDbNames(newDbNames);
        
        const successMessage = `数据库 "${getDisplayName(nameToDelete)}" 已被删除。`;
        setNotification({ type: 'success', title: '删除成功', message: successMessage });
    };
    deleteReq.onerror = (e) => {
        console.error("删除数据库失败:", e);
        setNotification({ type: 'error', title: '删除失败', message: '无法删除数据库。' });
    };
  };


  const handleCopyLogs = async () => {
    if (!notification) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(notification, null, 2));
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 2000);
    } catch (err) { console.error('复制日志失败: ', err); }
  };
  
  const contextMenuActions: ContextMenuAction[] = contextMenu ? [
    { label: '编辑', icon: <PencilIcon className="w-5 h-5" />, onClick: () => setEventToEdit(contextMenu.event) },
    { label: '删除', icon: <TrashIcon className="w-5 h-5" />, isDestructive: true, onClick: () => setConfirmDeleteEventId(contextMenu.event.id) }
  ] : [];

  const fabOnClick = fabMode === 'toTop' 
    ? () => {
        if ((selectedEvent || detailViewPlaceholder) && detailScrollRef.current) {
            detailScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (listScrollRef.current) {
            listScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
    } 
    : () => setAddEventModalOpen(true);

  const handleCardLongPress = (event: Event) => {
    setSelectedEventIds(new Set([event.id]));
  };

  const handleCardClick = (event: Event) => {
    if (isSelectionMode) {
        setSelectedEventIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(event.id)) {
                newSet.delete(event.id);
            } else {
                newSet.add(event.id);
            }
            return newSet;
        });
    } else {
        handleSelectEvent(event);
    }
  };

  const handleClearSelection = () => {
    setSelectedEventIds(new Set());
  };

  const handleDeleteSelectionRequest = () => {
    setConfirmDeleteSelection(true);
  };

  const executeDeleteSelection = () => {
    const idsToDelete: string[] = Array.from(selectedEventIds);
    if (selectedEvent && idsToDelete.includes(selectedEvent.id)) {
        setSelectedEvent(null);
        setDetailViewPlaceholder(`您正在查看的事件已在所选项目中被删除。`);
    }

    const updateEventsState = (prev: Event[]) => prev.filter(e => !idsToDelete.includes(e.id));
    
    if (isLoading || isTempStorageMode || dbError) {
        setEvents(updateEventsState);
        const deleteActions: PendingAction[] = idsToDelete.map(id => ({ type: 'DELETE_EVENT', payload: id }));
        
        const filterPendingActions = (actions: PendingAction[]): PendingAction[] => {
            return actions.filter(a => {
                switch (a.type) {
                    case 'DELETE_EVENT':
                        return !idsToDelete.includes(a.payload);
                    case 'ADD_EVENT':
                    case 'UPDATE_EVENT':
                        return !idsToDelete.includes(a.payload.event.id);
                    case 'UPDATE_EVENT_STEPS':
                        return !idsToDelete.includes(a.payload.eventId);
                    default:
                        return true;
                }
            });
        };
        
        setPendingActions(prev => [...filterPendingActions(prev), ...deleteActions]);
        showActionNotification(`${idsToDelete.length} 个删除操作已暂存`);
    } else {
        setEvents(updateEventsState);
        // Also delete original images from DB
        idsToDelete.forEach(id => deleteDataFromStoreByKey(activeDbName, STORES.originalImages, id));
    }
    
    handleClearSelection();
    setConfirmDeleteSelection(false);
  };

  const handleUpdateSelectionTags = (updates: { eventId: string; newTags: string[] }[]) => {
    const updatedEventsMap = new Map<string, Event>();
    events.forEach(event => {
        const update = updates.find(u => u.eventId === event.id);
        if (update) {
            const updatedEvent = { ...event, tags: update.newTags };
            updatedEventsMap.set(event.id, updatedEvent);
        }
    });

    const updateLogic = (prevEvents: Event[]) => 
        prevEvents.map(e => updatedEventsMap.has(e.id) ? updatedEventsMap.get(e.id)! : e);

    if (isLoading || isTempStorageMode || dbError) {
        setEvents(updateLogic);
        const updateActions: PendingAction[] = updates.map(({ eventId }) => ({
            type: 'UPDATE_EVENT',
            payload: { event: updatedEventsMap.get(eventId)! }
        }));
        setPendingActions(prev => [
            ...prev.filter(a => !(a.type === 'UPDATE_EVENT' && updatedEventsMap.has((a.payload as any).event.id))),
            ...updateActions
        ]);
        showActionNotification(`${updates.length} 个项目的标签已更新 (临时)`);
    } else {
        setEvents(updateLogic);
    }

    if (selectedEvent && updatedEventsMap.has(selectedEvent.id)) {
        setSelectedEvent(updatedEventsMap.get(selectedEvent.id)!);
    }
  };
  
  const selectedEventsForTagging = useMemo(() => 
    isManageSelectionTagsModalOpen ? events.filter(e => selectedEventIds.has(e.id)) : [],
    [isManageSelectionTagsModalOpen, events, selectedEventIds]
  );

  const renderEventList = () => {
    if (isLoading && events.length === 0) {
        return (
            <div className="flex items-center justify-center h-full pt-20">
                <div className="flex flex-col items-center gap-4 text-slate-500 dark:text-slate-400">
                    <LoadingSpinnerIcon className="w-8 h-8" />
                    <p className="font-semibold">正在加载事件...</p>
                </div>
            </div>
        );
    }
    if (filteredEvents.length === 0) {
        return <div className="text-center py-20"><h2 className="text-2xl font-semibold text-slate-600 dark:text-slate-400">未找到事件</h2><p className="mt-2 text-slate-500">尝试更改筛选条件或添加新事件。</p></div>;
    }

    return (
      <div
        style={{
          columnCount: gridConfig.numColumns,
          columnGap: '1.5rem', // Corresponds to Tailwind's `gap-6`
        }}
      >
        {filteredEvents.map((event, index) => (
          <div
            key={event.id}
            className="animate-content-enter opacity-0 mb-6"
            style={{
              animationDelay: `${index * 50}ms`,
              breakInside: 'avoid',
            }}
          >
            <EventCard
              event={event}
              onClick={handleCardClick}
              onLongPress={handleCardLongPress}
              isSelected={selectedEventIds.has(event.id)}
              isSelectionMode={isSelectionMode}
              onOpenContextMenu={handleOpenContextMenu}
              collapseCardImages={collapseCardImages}
            />
          </div>
        ))}
      </div>
    );
  };
  
  const handleCloseWelcomeModal = () => {
    setIsWelcomeModalOpen(false);
    localStorage.setItem('hasSeenWelcomeModal', 'true');
  };

  const handleEnterDemoMode = () => {
    handleSwitchDb(DEMO_DB_NAME_EXPORT);
    handleCloseWelcomeModal();
  };

  const isMobileDetailView = (selectedEvent || detailViewPlaceholder) && windowWidth < 1024;

  return (
    <div className="h-screen text-slate-800 dark:text-slate-200 relative">
      <div
        ref={headerRef}
        className={`${isMobileDetailView ? 'hidden' : ''} absolute top-0 left-0 right-0 z-40 transition-all duration-300 backdrop-blur-lg`}
      >
        <Header
          searchQuery={searchQuery} onSearchChange={setSearchQuery}
          sortOrder={sortOrder} onSortChange={setSortOrder}
          onOpenSettings={() => setSettingsModalOpen(true)}
          isSelectionMode={isSelectionMode}
          selectedCount={selectedEventIds.size}
          onClearSelection={handleClearSelection}
          onDeleteSelection={handleDeleteSelectionRequest}
          onManageSelectionTags={() => setIsManageSelectionTagsModalOpen(true)}
        />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="pt-2 flex-shrink-0 transition-all duration-300 pb-8 -mx-4 sm:-mx-6 lg:-mx-8">
            <FilterChips
              activeFilters={activeFilters} onStatusChange={handleStatusFilterChange}
              onTagToggle={handleTagFilterChange} customTags={customTags}
              onManageTags={() => setManageTagsModalOpen(true)}
              isExpanded={isFilterBarExpanded}
              onToggleExpand={() => setIsFilterBarExpanded(prev => !prev)}
              onResetTags={handleResetTagFilters}
            />
          </div>
        </div>
      </div>

      <div className="absolute inset-0">
        <div className="max-w-7xl mx-auto h-full">
          <main className="h-full lg:flex lg:gap-x-4 items-start">
            <aside
              ref={listScrollRef}
              className={`no-scrollbar h-full overflow-y-auto ${selectedEvent || detailViewPlaceholder ? 'hidden lg:block lg:flex-1 min-w-0' : 'w-full'} bg-slate-100 dark:bg-slate-900`}
              onClick={() => { if (isSelectionMode) { handleClearSelection(); } }}
            >
              <div className="pb-24 px-4 sm:px-6 lg:px-8" style={{ paddingTop: `${headerHeight}px` }}>
                {renderEventList()}
              </div>
            </aside>

            {(selectedEvent || detailViewPlaceholder) && !isClosingDetail && (
              <div className="hidden lg:flex items-start flex-shrink-0">
                 <div className="pt-8" style={{ paddingTop: `${headerHeight}px` }}>
                    <ControlsBar onClose={handleBackToList} />
                 </div>
              </div>
            )}
            
            <section
              ref={detailScrollRef}
              className={`no-scrollbar h-full overflow-y-auto opacity-0 ${selectedEvent || detailViewPlaceholder ? 'w-full lg:w-1/3 flex-shrink-0' : 'hidden'} ${isClosingDetail ? 'animate-view-exit' : 'animate-view-enter'} bg-slate-100 dark:bg-slate-900`}
            >
              {selectedEvent ? (
                <div className="pb-24 px-4 sm:px-6 lg:px-8" style={{ paddingTop: `${headerHeight}px` }}>
                  <EventDetailView key={selectedEvent.id} event={selectedEvent} activeDbName={activeDbName} onBack={handleBackToList} onUpdateEvent={(updatedEvent) => handleUpdateEvent(updatedEvent)} onEdit={setEventToEdit} onEditSteps={handleOpenStepsEditor} overviewBlockSize={overviewBlockSize} onOverviewBlockSizeChange={setOverviewBlockSize} />
                </div>
              ) : detailViewPlaceholder ? (
                 <div className="flex items-center justify-center h-full" style={{ paddingTop: `${headerHeight}px` }}>
                    <div className="text-center text-slate-500 dark:text-slate-400 px-8 flex flex-col items-center gap-4">
                        <ArchiveBoxIcon className="w-12 h-12 text-slate-400 dark:text-slate-500" />
                        <p className="font-semibold">{detailViewPlaceholder}</p>
                    </div>
                </div>
              ) : null}
            </section>
          </main>
        </div>
      </div>
      
      {!isSelectionMode && <FAB onClick={fabOnClick} mode={fabMode} />}
      {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} actions={contextMenuActions} onClose={handleCloseContextMenu}/>}
      
      <Modal isOpen={isAddEventModalOpen} onClose={closeAddEventModal} title="创建新事件" variant="sheet">
        <div className="space-y-4">
          <div><label htmlFor="eventTitle" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">事件标题*</label><input type="text" id="eventTitle" value={newEventTitle} onChange={(e) => setNewEventTitle(e.target.value)} placeholder="例如：规划一次为期一周的旅行" className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-slate-500 focus:border-slate-500" /></div>
          <div><label htmlFor="eventDescription" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">描述</label><textarea id="eventDescription" value={newEventDescription} onChange={(e) => setNewEventDescription(e.target.value)} placeholder="为此新项目添加一些细节..." rows={4} className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-slate-500 focus:border-slate-500" /></div>
          <div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">标签</label><TagInput availableTags={customTags} selectedTags={newEventTags} onChange={setNewEventTags}/></div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              封面图片
            </label>
            <input
              id="add-image-upload"
              type="file"
              className="sr-only"
              accept="image/*"
              onChange={(e) => handleImageSelected(e.target.files ? e.target.files[0] : null)}
              disabled={isProcessingImage}
            />
            <label
              htmlFor="add-image-upload"
              className={`relative ${isProcessingImage ? 'cursor-not-allowed' : 'cursor-pointer'} bg-white dark:bg-slate-700 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 flex justify-center items-center w-full h-48 text-center hover:border-slate-400 dark:hover:border-slate-500 transition-colors`}
            >
              {isProcessingImage ? (
                <div className="flex flex-col items-center gap-2 text-slate-500 dark:text-slate-400">
                  <LoadingSpinnerIcon className="w-8 h-8" />
                  <span>正在处理...</span>
                </div>
              ) : newEventImage ? (
                <>
                  <img src={newEventImage} alt="预览" className="w-full h-full object-contain rounded-lg p-1" />
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setNewEventImage(null); setNewEventOriginalImage(null); }}
                    className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-2 hover:bg-black/70"
                    aria-label="移除图片"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </>
              ) : (
                <div className="text-slate-500 dark:text-slate-400 px-6">
                  <svg className="mx-auto h-12 w-12" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                    <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <p className="mt-2">点击选择文件</p>
                </div>
              )}
            </label>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={closeAddEventModal} className="px-5 py-2.5 rounded-lg text-slate-700 dark:text-slate-200 bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 transition-all active:scale-95 text-base font-medium">取消</button>
            <button onClick={handleAddEvent} disabled={isProcessingImage} className="px-5 py-2.5 rounded-lg bg-slate-900 dark:bg-slate-200 text-white dark:text-slate-900 font-semibold hover:bg-slate-700 dark:hover:bg-slate-300 transition-all active:scale-95 text-base disabled:bg-slate-400 dark:disabled:bg-slate-700 disabled:cursor-not-allowed">创建事件</button>
          </div>
        </div>
      </Modal>

      <ManageTagsModal 
        isOpen={isManageTagsModalOpen} 
        onClose={() => setManageTagsModalOpen(false)} 
        tags={customTags} 
        onAddTag={handleAddTag} 
        onDeleteTags={handleDeleteTags} 
        onRenameTag={handleRenameTag}
        onReorderTags={handleReorderTags}
      />
      <ManageSelectionTagsModal
        isOpen={isManageSelectionTagsModalOpen}
        onClose={() => setIsManageSelectionTagsModalOpen(false)}
        availableTags={customTags}
        selectedEvents={selectedEventsForTagging}
        onApply={handleUpdateSelectionTags}
        onAddTag={handleAddTag}
      />
      <EventEditModal event={eventToEdit} isOpen={!!eventToEdit} onClose={() => setEventToEdit(null)} onUpdate={handleUpdateEvent} availableTags={customTags} />
      
      <SettingsModal
        isOpen={isSettingsModalOpen} onClose={() => setSettingsModalOpen(false)}
        density={cardDensity} onDensityChange={setCardDensity}
        collapseCardImages={collapseCardImages} onCollapseCardImagesChange={setCollapseCardImages}
        isDeveloperMode={isDeveloperMode} onDeveloperModeChange={setIsDeveloperMode}
        windowWidth={windowWidth} 
        onOpenDbManager={async () => {
          const names = await discoverDatabases();
          setUserDbNames(names);
          setSettingsModalOpen(false);
          setIsDbManagerOpen(true);
        }}
        numColumns={gridConfig.numColumns}
      />

      <DatabaseManagerModal 
        isOpen={isDbManagerOpen}
        onClose={() => setIsDbManagerOpen(false)}
        activeDbName={activeDbName}
        userDbNames={userDbNames}
        onSwitchDb={handleSwitchDb}
        onOpenCreateDb={() => setIsCreateDbModalOpen(true)}
        onDeleteDbRequest={(name) => setDbToDelete(name)}
        onFormatAppRequest={() => { setIsDbManagerOpen(false); setFormatConfirmModalOpen(true); }}
        onExport={handleExportData} 
        onImport={handleImportRequest}
        dbError={dbError}
      />

      <Modal isOpen={isCreateDbModalOpen} onClose={() => setIsCreateDbModalOpen(false)} title="创建新数据库" variant="sheet">
        <div className="space-y-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">为一组新项目（例如“工作”或“个人”）创建一个单独的数据库。</p>
            <div>
              <label htmlFor="newDbName" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">数据库名称</label>
              <input type="text" id="newDbName" value={newDbNameInput} onChange={(e) => setNewDbNameInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreateNewDb()} placeholder="例如：工作项目" className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-slate-500 focus:border-slate-500" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setIsCreateDbModalOpen(false)} className="px-5 py-2.5 rounded-lg text-slate-700 dark:text-slate-200 bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 transition-all active:scale-95 text-base font-medium">取消</button>
                <button onClick={handleCreateNewDb} className="px-5 py-2.5 rounded-lg bg-slate-900 dark:bg-slate-200 text-white dark:text-slate-900 font-semibold hover:bg-slate-700 dark:hover:bg-slate-300 transition-all active:scale-95 text-base flex items-center gap-2"><PlusIcon className="w-5 h-5" />创建</button>
            </div>
        </div>
      </Modal>

      <Modal isOpen={!!dbToDelete} onClose={() => setDbToDelete(null)} title="确认删除数据库" variant="dialog">
        <div className="space-y-4">
            <p className="text-slate-600 dark:text-slate-300">您确定要永久删除数据库 <span className="font-bold">{dbToDelete ? getDisplayName(dbToDelete) : ''}</span> 吗？此操作无法撤销。</p>
            <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setDbToDelete(null)} className="px-5 py-2.5 rounded-lg text-slate-700 dark:text-slate-200 bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 transition-all active:scale-95 text-base font-medium">取消</button>
                <button onClick={handleDeleteDb} className="px-5 py-2.5 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 transition-all active:scale-95 text-base">删除</button>
            </div>
        </div>
      </Modal>
      
      <Modal isOpen={confirmDeleteSelection} onClose={() => setConfirmDeleteSelection(false)} title="确认删除" variant="dialog">
        <div className="space-y-4">
            <p className="text-slate-600 dark:text-slate-300">您确定要删除选中的 {selectedEventIds.size} 个事件吗？此操作无法撤销。</p>
            <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setConfirmDeleteSelection(false)} className="px-5 py-2.5 rounded-lg text-slate-700 dark:text-slate-200 bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 transition-all active:scale-95 text-base font-medium">取消</button>
                <button onClick={executeDeleteSelection} className="px-5 py-2.5 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 transition-all active:scale-95 text-base">删除</button>
            </div>
        </div>
      </Modal>

      <Modal isOpen={!!confirmDeleteEventId} onClose={() => setConfirmDeleteEventId(null)} title="确认删除" variant="dialog">
        <div className="space-y-4">
            <p className="text-slate-600 dark:text-slate-300">您确定要删除此事件吗？此操作无法撤销。</p>
            <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setConfirmDeleteEventId(null)} className="px-5 py-2.5 rounded-lg text-slate-700 dark:text-slate-200 bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 transition-all active:scale-95 text-base font-medium">取消</button>
                <button onClick={() => { if (confirmDeleteEventId) handleDeleteEvent(confirmDeleteEventId); setConfirmDeleteEventId(null); }} className="px-5 py-2.5 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 transition-all active:scale-95 text-base">删除</button>
            </div>
        </div>
      </Modal>

      <Modal isOpen={isFormatConfirmModalOpen} onClose={() => setFormatConfirmModalOpen(false)} title={isTempStorageMode ? "确认重置会话" : "确认格式化 埃森梅莉亚 (Essenmelia)"} variant="dialog">
          <div className="space-y-4">
              <div className="flex items-start gap-3">
                  <ExclamationTriangleIcon className={`w-10 h-10 ${isTempStorageMode ? 'text-yellow-500' : 'text-red-500'} flex-shrink-0`} />
                  <div>
                    <p className="text-slate-600 dark:text-slate-300 font-semibold">
                        {isTempStorageMode ? "您确定要重置当前会话吗？" : "您确定要格式化应用程序吗？"}
                    </p>
                    <p className="text-slate-600 dark:text-slate-300 mt-2">
                        {isTempStorageMode ? "此操作将清除您在临时存储模式下所做的所有未保存的更改，并将您的会话恢复到初始状态。此操作无法撤销。" : "此操作将永久删除所有数据库和数据。此操作无法撤销。"}
                    </p>
                  </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                  <button onClick={() => setFormatConfirmModalOpen(false)} className="px-5 py-2.5 rounded-lg text-slate-700 dark:text-slate-200 bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 transition-all active:scale-95 text-base font-medium">取消</button>
                  <button onClick={handleFormatApp} className={`px-5 py-2.5 rounded-lg text-white font-semibold transition-all active:scale-95 text-base ${isTempStorageMode ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-red-600 hover:bg-red-700'}`}>
                    {isTempStorageMode ? '是的，重置' : '是的，格式化'}
                  </button>
              </div>
          </div>
      </Modal>
      
      <Modal isOpen={!!importFile} onClose={() => setImportFile(null)} title="确认导入数据" variant="dialog">
        <div className="space-y-4">
            <div className="flex items-start gap-3"><ExclamationTriangleIcon className="w-10 h-10 text-yellow-500 flex-shrink-0" />
                <div><p className="text-slate-600 dark:text-slate-300 font-semibold">您确定要继续吗？</p><p className="text-slate-600 dark:text-slate-300 mt-2">导入此文件会将所有数据添加到当前激活的数据库中。所有事件、步骤和模板都将作为新项目添加。</p></div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setImportFile(null)} className="px-5 py-2.5 rounded-lg text-slate-700 dark:text-slate-200 bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 transition-all active:scale-95 text-base font-medium">取消</button>
                <button onClick={executeImport} className="px-5 py-2.5 rounded-lg bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 font-semibold hover:bg-slate-700 dark:hover:bg-slate-300 transition-all active:scale-95 text-base">是的，导入</button>
            </div>
        </div>
      </Modal>

      <Modal isOpen={!!confirmDiscardChanges} onClose={() => setConfirmDiscardChanges(null)} title="确认切换" variant="dialog">
        <div className="space-y-4">
            <div className="flex items-start gap-3">
                <ExclamationTriangleIcon className="w-10 h-10 text-yellow-500 flex-shrink-0" />
                <div>
                  <p className="text-slate-600 dark:text-slate-300 font-semibold">
                      您有未保存的临时更改。
                  </p>
                  <p className="text-slate-600 dark:text-slate-300 mt-2">
                      切换到此数据库将永久丢弃您在当前会话中所做的更改。您确定要继续吗？
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
                      提示：您可以创建一个新数据库来保存您的更改。
                  </p>
                </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setConfirmDiscardChanges(null)} className="px-5 py-2.5 rounded-lg text-slate-700 dark:text-slate-200 bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 transition-all active:scale-95 text-base font-medium">取消</button>
                <button onClick={() => executeDiscardAndSwitch(confirmDiscardChanges!)} className="px-5 py-2.5 rounded-lg bg-yellow-600 text-white font-semibold hover:bg-yellow-700 transition-all active:scale-95 text-base">
                  继续并丢弃
                </button>
            </div>
        </div>
      </Modal>

      {notification && (
        <Modal isOpen={!!notification} onClose={() => { if (notification?.onConfirm) notification.onConfirm(); setNotification(null); setCopyStatus('idle'); }} title={notification.title} variant="dialog">
            <div className="space-y-4">
                <div className="flex items-start gap-4">
                    {notification.type === 'success' ? <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center flex-shrink-0"><CheckIcon className="w-6 h-6 text-green-600 dark:text-green-400" /></div> : <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center flex-shrink-0"><ExclamationTriangleIcon className="w-6 h-6 text-red-600 dark:text-red-400" /></div>}
                    <p className="text-slate-600 dark:text-slate-300 pt-2">{notification.message}</p>
                </div>
                <div className="flex justify-between items-center pt-2">
                    <div>{isDeveloperMode && <button onClick={handleCopyLogs} className="px-4 py-2 rounded-lg text-xs text-slate-600 dark:text-slate-300 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 transition-all active:scale-95 font-mono">{copyStatus === 'copied' ? '已复制!' : '复制日志'}</button>}</div>
                    <div className="flex justify-end"><button onClick={() => { if (notification.onConfirm) notification.onConfirm(); setNotification(null); setCopyStatus('idle'); }} className="px-5 py-2.5 rounded-lg bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 font-semibold hover:bg-slate-700 dark:hover:bg-slate-300 transition-all active:scale-95 text-base">好的</button></div>
                </div>
            </div>
        </Modal>
      )}

      <StepsEditorPanel isOpen={isStepsEditorOpen} onClose={() => setIsStepsEditorOpen(false)} event={eventForStepsEditor} templates={stepTemplates} stepSetTemplates={stepSetTemplates} onStepsChange={handleUpdateEventSteps} onTemplatesChange={setStepTemplates} onStepSetTemplatesChange={setStepSetTemplates} />
      
      <WelcomeModal
        isOpen={isWelcomeModalOpen}
        onClose={handleCloseWelcomeModal}
        onEnterDemo={handleEnterDemoMode}
      />

      <Snackbar 
        isOpen={!!dbStatus}
        message={dbStatus?.message || ''}
        type={dbStatus?.type}
        bottomClass="bottom-8"
      />
      <Snackbar 
        isOpen={!!actionNotification}
        message={actionNotification?.message || ''}
        icon={<ArchiveBoxIcon className="w-5 h-5" />}
        bottomClass={dbStatus ? 'bottom-24' : 'bottom-8'}
      />
    </div>
  );
};

export default App;
