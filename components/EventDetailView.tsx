

import React, { useState, useEffect, useRef } from 'react';
import { Event, ProgressStep } from '../types';
import { ArrowLeftIcon, CheckIcon, PencilIcon, ArrowUpTrayIcon } from './icons';
import { getDataFromStoreByKey, DEFAULT_ANIMATED_PLACEHOLDER } from '../App';
import AnimatedPlaceholder from './AnimatedPlaceholder';


type OverviewBlockSize = 'sm' | 'md' | 'lg';

interface EventDetailViewProps {
  event: Event;
  onBack: () => void;
  onUpdateEvent: (updatedEvent: Event) => void;
  onEdit: (event: Event) => void;
  onEditSteps: (event: Event) => void;
  overviewBlockSize: OverviewBlockSize;
  onOverviewBlockSizeChange: (size: OverviewBlockSize) => void;
  activeDbName: string;
}

const sizeConfig: Record<OverviewBlockSize, { container: string; text: string; icon: string }> = {
  sm: { container: '', text: 'text-xl', icon: 'w-7 h-7' },
  md: { container: '', text: 'text-2xl', icon: 'w-8 h-8' },
  lg: { container: '', text: 'text-3xl', icon: 'w-10 h-10' },
};

const sizeOptions: { id: OverviewBlockSize; label: string }[] = [
  { id: 'sm', label: '小' },
  { id: 'md', label: '中' },
  { id: 'lg', label: '大' },
];


const TimelineItem: React.FC<{ step: ProgressStep; onToggle: () => void; isLast: boolean }> = ({ step, onToggle, isLast }) => {
  return (
    <div className="relative flex items-start">
      <div className="flex flex-col items-center mr-4">
        <div
          onClick={onToggle}
          className={`w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-all duration-300 active:scale-90 ${
            step.completed ? 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900' : 'bg-slate-200 dark:bg-slate-700 border-2 border-slate-300 dark:border-slate-600 hover:bg-slate-300 dark:hover:bg-slate-600'
          }`}
        >
          {step.completed && <CheckIcon className="w-5 h-5 animate-dialog-enter" />}
        </div>
        {!isLast && <div className={`w-0.5 grow transition-colors duration-500 ${step.completed ? 'bg-slate-800 dark:bg-slate-400' : 'bg-slate-300 dark:bg-slate-600'}`}></div>}
      </div>
      <div className={`pt-2.5 pb-8 transition-opacity duration-300 ${step.completed ? 'opacity-60' : 'opacity-100'}`}>
        <p className={`font-medium text-slate-800 dark:text-slate-100 transition-all duration-300 ${step.completed ? 'line-through' : ''}`}>{step.description}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{step.timestamp.toLocaleString()}</p>
      </div>
    </div>
  );
};

const EventDetailView: React.FC<EventDetailViewProps> = ({ event, onBack, onUpdateEvent, onEdit, onEditSteps, overviewBlockSize, onOverviewBlockSizeChange, activeDbName }) => {
  const [localSteps, setLocalSteps] = useState(() => [...event.steps].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()));
  const isSwipingRef = useRef(false);
  const swipeTargetStateRef = useRef(false);
  const swipedThisActionRef = useRef(false);

  useEffect(() => {
      setLocalSteps([...event.steps].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()));
  }, [event.steps]);

  const handlePointerMove = (e: PointerEvent) => {
      if (!isSwipingRef.current) return;
      swipedThisActionRef.current = true;

      const element = document.elementFromPoint(e.clientX, e.clientY);
      const stepBlock = element?.closest<HTMLElement>('[data-step-id]');
      
      if (stepBlock?.dataset.stepId) {
          const stepId = stepBlock.dataset.stepId;
          setLocalSteps(prev => prev.map(step => {
              if (step.id === stepId && step.completed !== swipeTargetStateRef.current) {
                  return { ...step, completed: swipeTargetStateRef.current };
              }
              return step;
          }));
      }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement> | PointerEvent) => {
      if (!isSwipingRef.current) return;
      isSwipingRef.current = false;

      if ('pointerId' in e) {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      }
      
      const finalUpdatedSteps = event.steps.map(originalStep => {
          const localVersion = localSteps.find(ls => ls.id === originalStep.id);
          return localVersion ? { ...originalStep, completed: localVersion.completed } : originalStep;
      });

      onUpdateEvent({ ...event, steps: finalUpdatedSteps });

      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp as EventListener);
      document.body.style.userSelect = '';
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>, step: ProgressStep) => {
      if (step.id !== localSteps[0]?.id) return;
      
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      
      isSwipingRef.current = true;
      swipedThisActionRef.current = false;
      const targetState = !step.completed;
      swipeTargetStateRef.current = targetState;
      
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp as EventListener);
      document.body.style.userSelect = 'none';
  };

  const handleOverviewBlockClick = (stepId: string) => {
      if (swipedThisActionRef.current) {
          swipedThisActionRef.current = false;
          return;
      }

      const updatedSteps = event.steps.map(step =>
          step.id === stepId ? { ...step, completed: !step.completed } : step
      );
      onUpdateEvent({ ...event, steps: updatedSteps });
  };
  
  const handleTimelineToggleStep = (stepId: string) => {
    const updatedSteps = event.steps.map(step =>
      step.id === stepId ? { ...step, completed: !step.completed } : step
    );
    onUpdateEvent({ ...event, steps: updatedSteps });
  };

  const handleDownloadOriginal = async () => {
    try {
      const originalImageFile = await getDataFromStoreByKey(activeDbName, 'originalImages', event.id);
      if (originalImageFile instanceof File) {
        const url = URL.createObjectURL(originalImageFile);
        const a = document.createElement('a');
        a.href = url;
        a.download = originalImageFile.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        console.warn("未找到原始图片或存储的数据格式不正确。");
      }
    } catch (error) {
        console.error("下载原始图片失败:", error);
    }
  };
  
  const sortedSteps = localSteps;
  
  const gridLayoutClasses = {
      sm: 'grid-cols-7',
      md: 'grid-cols-6',
      lg: 'grid-cols-5',
  }[overviewBlockSize];

  return (
    <div className="max-w-3xl mx-auto lg:max-w-none lg:mx-0">
      <header className="mb-8 animate-content-enter opacity-0" style={{ animationDelay: '100ms' }}>
        <button onClick={onBack} className="flex items-center text-slate-700 dark:text-slate-300 hover:underline mb-4 lg:hidden p-2 -ml-2">
          <ArrowLeftIcon className="w-5 h-5 mr-2" />
          返回所有事件
        </button>
        <h2 className="text-3xl lg:text-4xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight">{event.title}</h2>
        <p className="mt-2 text-lg text-slate-600 dark:text-slate-400">{event.description}</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">创建于: {event.createdAt.toLocaleDateString()}</p>
      </header>
      
      {event.imageUrl === DEFAULT_ANIMATED_PLACEHOLDER ? (
        <div className="mb-12 rounded-2xl overflow-hidden shadow-lg animate-content-enter opacity-0" style={{ animationDelay: '200ms' }}>
          <AnimatedPlaceholder className="w-full object-cover aspect-video" />
        </div>
      ) : event.imageUrl ? (
        <div className="mb-12 rounded-2xl overflow-hidden shadow-lg animate-content-enter opacity-0" style={{ animationDelay: '200ms' }}>
          <img src={event.imageUrl} alt={event.title} className="w-full object-cover aspect-video" />
        </div>
      ) : null}
      
      {event.steps.length > 0 && (
        <div className="mb-12 animate-content-enter opacity-0" style={{ animationDelay: '300ms' }}>
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-200">步骤概览</h3>
            <div className="flex items-center gap-1 bg-slate-200 dark:bg-slate-700 p-1 rounded-lg">
              {sizeOptions.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => onOverviewBlockSizeChange(opt.id)}
                  className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors ${
                    overviewBlockSize === opt.id
                      ? 'bg-white dark:bg-slate-800 shadow-sm text-slate-800 dark:text-slate-100'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-800/50'
                  }`}
                  aria-pressed={overviewBlockSize === opt.id}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className={`grid ${gridLayoutClasses} gap-3 touch-none`}>
            {sortedSteps.map(step => {
              const emojiRegex = /^\p{Emoji_Presentation}/u;
              const emojiMatch = step.description.match(emojiRegex);
              const isEmojiStep = !!emojiMatch;

              // New: Check for space-separated words, which will be styled as squares with the first word.
              const parts = step.description.split(' ');
              const isFirstWordStyle = parts.length > 1;

              // Original symbolic logic, adjusted to not conflict with the new style.
              const containsCJK = /[\u4e0-\u9fa5]/.test(step.description);
              const isSymbolic = !isEmojiStep && !isFirstWordStyle && !containsCJK && step.description.length <= 3;
              
              // If it has a space, is an emoji, or is symbolic, use a square layout.
              const layoutClasses = (isFirstWordStyle || isEmojiStep || isSymbolic) ? 'items-center aspect-square' : 'items-start h-full';

              // Display text precedence: first word > emoji > first 3 chars.
              const displayText = isFirstWordStyle 
                ? parts[0] 
                : (isEmojiStep ? emojiMatch[0] : step.description.substring(0, 3));


              return (
                <button
                  key={step.id}
                  data-step-id={step.id}
                  onPointerDown={(e) => handlePointerDown(e, step)}
                  onPointerUp={(e) => handlePointerUp(e)}
                  onClick={() => handleOverviewBlockClick(step.id)}
                  title={step.description}
                  aria-label={`切换步骤状态: ${step.description}`}
                  className={`
                    relative rounded-xl flex ${layoutClasses} justify-center p-2 text-center
                    transition-all duration-200 ease-in-out transform hover:-translate-y-1 active:scale-95 shadow-md group
                    ${sizeConfig[overviewBlockSize].container}
                    ${step.completed 
                      ? 'bg-slate-800 dark:bg-slate-300' 
                      : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:shadow-lg'
                    }
                  `}
                >
                  {step.completed && (
                    <div className="absolute inset-0 bg-black/40 rounded-xl flex items-center justify-center">
                      <CheckIcon className={`${sizeConfig[overviewBlockSize].icon} text-white/90 animate-dialog-enter`} />
                    </div>
                  )}
                  <span className={`${sizeConfig[overviewBlockSize].text} font-extrabold transition-opacity ${step.completed ? 'opacity-30 text-white' : 'text-slate-800 dark:text-slate-100'}`}>
                    {displayText}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="animate-content-enter opacity-0" style={{ animationDelay: '400ms' }}>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-200">进度时间线</h3>
          <div className="flex items-center gap-3">
             {event.hasOriginalImage && (
              <button
                onClick={handleDownloadOriginal}
                className="flex items-center gap-2 text-slate-600 dark:text-slate-300 font-semibold px-4 py-2.5 rounded-lg shadow-sm bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 transition-all active:scale-95"
              >
                <ArrowUpTrayIcon className="w-5 h-5" />
                下载原图
              </button>
            )}
             <button
              onClick={() => onEdit(event)}
              className="flex items-center gap-2 text-slate-600 dark:text-slate-300 font-semibold px-4 py-2.5 rounded-lg shadow-sm bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 transition-all active:scale-95"
            >
              <PencilIcon className="w-5 h-5"/>
              编辑事件
            </button>
            <button
              onClick={() => onEditSteps(event)}
              className="flex items-center gap-2 bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 font-semibold px-4 py-2.5 rounded-lg shadow-md hover:bg-slate-700 dark:hover:bg-slate-300 transition-all active:scale-95"
            >
              <PencilIcon className="w-5 h-5"/>
              编辑步骤
            </button>
          </div>
        </div>

        {event.steps.length > 0 ? (
          <div className="relative">
             {localSteps.map((step, index) => (
              <TimelineItem 
                key={step.id} 
                step={step} 
                onToggle={() => handleTimelineToggleStep(step.id)}
                isLast={index === event.steps.length - 1}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-slate-50 dark:bg-slate-800/50 rounded-2xl">
            <p className="text-slate-500 dark:text-slate-400">尚未添加任何进度步骤。</p>
            <p className="text-slate-500 dark:text-slate-400">点击“编辑步骤”开始！</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default EventDetailView;