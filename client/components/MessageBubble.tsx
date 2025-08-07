import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { 
  Download, 
  Image, 
  FileText, 
  Music, 
  File as FileIcon,
  Video,
  Archive
} from 'lucide-react';
import { Message, Friend, Group } from '@shared/api';
import { format, parseISO } from 'date-fns';

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  chatType: 'friend' | 'group';
  chatData: Friend | Group;
}

export const MessageBubble = ({ message, isOwn, chatType, chatData }: MessageBubbleProps) => {
  const formatTime = (timestamp: string) => {
    try {
      return format(parseISO(timestamp), 'HH:mm');
    } catch {
      return format(new Date(timestamp), 'HH:mm');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) {
      return <Image className="h-4 w-4" />;
    } else if (fileType.startsWith('video/')) {
      return <Video className="h-4 w-4" />;
    } else if (fileType.startsWith('audio/')) {
      return <Music className="h-4 w-4" />;
    } else if (fileType.includes('pdf') || fileType.includes('document')) {
      return <FileText className="h-4 w-4" />;
    } else if (fileType.includes('zip') || fileType.includes('rar')) {
      return <Archive className="h-4 w-4" />;
    }
    return <FileIcon className="h-4 w-4" />;
  };

  const getSenderInitials = () => {
    if (chatType === 'friend') {
      const friend = chatData as Friend;
      return friend.firstname.charAt(0) + friend.lastname.charAt(0);
    }
    return 'U'; // For group chats, we'd need sender info
  };

  const downloadFile = async () => {
    if (!message.attachment_id) return;
    
    try {
      const response = await fetch(
        `http://127.0.0.1:8096/attachments/${message.attachment_id}/download`,
        { method: 'GET' }
      );
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = message.file_name || 'download';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('Error downloading file:', error);
    }
  };

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} group`}>
      <div className={`flex max-w-xs lg:max-w-md ${isOwn ? 'flex-row-reverse' : 'flex-row'} items-end space-x-2`}>
        {!isOwn && (
          <Avatar className="w-8 h-8 mb-1">
            <AvatarFallback className="bg-gradient-to-r from-gray-500 to-gray-600 text-white text-xs">
              {getSenderInitials()}
            </AvatarFallback>
          </Avatar>
        )}
        
        <div className={`${isOwn ? 'mr-2' : 'ml-2'}`}>
          <div
            className={`rounded-2xl px-4 py-2 ${
              isOwn
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-gray-200 text-gray-900'
            } shadow-sm`}
          >
            {message.type === 'message' && message.content && (
              <p className="text-sm whitespace-pre-wrap break-words">
                {message.content}
              </p>
            )}
            
            {message.type === 'file' && (
              <div className="space-y-2">
                <div className="flex items-center space-x-3">
                  <div className={`p-2 rounded-lg ${
                    isOwn ? 'bg-blue-500' : 'bg-gray-100'
                  }`}>
                    {message.file_type && getFileIcon(message.file_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {message.file_name}
                    </p>
                    <p className={`text-xs ${
                      isOwn ? 'text-blue-100' : 'text-gray-500'
                    }`}>
                      {message.file_size && formatFileSize(message.file_size)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`h-8 w-8 p-0 ${
                      isOwn 
                        ? 'text-white hover:bg-blue-500' 
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                    onClick={downloadFile}
                  >
                    <Download className="h-3 w-3" />
                  </Button>
                </div>
                
                {message.description && (
                  <p className="text-sm">
                    {message.description}
                  </p>
                )}
                
                {/* Image preview for image files */}
                {/* {message.file_type?.startsWith('image/') && (
                  <div className="mt-2">
                    <img
                      src={`http://127.0.0.1:8096/attachments/${message.attachment_id}/download`}
                      alt={message.file_name || 'Image'}
                      className="max-w-full h-auto rounded-lg cursor-pointer"
                      onClick={downloadFile}
                    />
                  </div>
                )} */}
              </div>
            )}
          </div>
          
          <div className={`flex items-center mt-1 space-x-1 ${
            isOwn ? 'justify-end' : 'justify-start'
          }`}>
            <span className="text-xs text-gray-500">
              {formatTime(message.created_at)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
