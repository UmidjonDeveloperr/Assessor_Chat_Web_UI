import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  MessageCircle,
  Users,
  LogOut,
  Settings,
  Search,
  Plus,
  Menu,
  X
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Friend, Group } from '@shared/api';
import { ChatArea } from './ChatArea';

export const Messenger = () => {
  const { user, logout } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedChat, setSelectedChat] = useState<{
    type: 'friend' | 'group';
    data: Friend | Group;
    conversationId?: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    fetchFriendsAndGroups();

    // Check for mobile
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const fetchFriendsAndGroups = async () => {
    try {
      const [friendsRes, groupsRes] = await Promise.all([
        fetch('http://127.0.0.1:8096/friends', {
          headers: { 'accept': 'application/json' }
        }),
        fetch('http://127.0.0.1:8096/groups', {
          headers: { 'accept': 'application/json' }
        })
      ]);

      if (friendsRes.ok) {
        const friendsData = await friendsRes.json();
        console.log('Friends response data:', friendsData);
        setFriends(friendsData);
      }

      if (groupsRes.ok) {
        const groupsData = await groupsRes.json();
        setGroups(groupsData);
      }
    } catch (error) {
      console.error('Error fetching friends and groups:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFriendClick = async (friend: Friend) => {
    try {
      console.log('Friend clicked:', friend);
      console.log('Current user ID:', user?.user_id);
      console.log('Friend ID:', friend.id);

      // Check if friend has id
      if (!friend.id) {
        console.error('Friend does not have id. The /friends endpoint needs to include id field.');
        alert('Unable to start conversation: Friend ID is missing. Please check that the backend /friends endpoint includes id.');
        return;
      }

      if (!user?.user_id) {
        console.error('Current user ID is missing');
        return;
      }

      // Get conversation ID for friend
      const conversationUrl = `http://127.0.0.1:8096/conversation/${user.user_id}/${friend.id}`;
      console.log('Fetching conversation from:', conversationUrl);

      const response = await fetch(conversationUrl, {
        headers: { 'accept': 'application/json' }
      });

      if (response.ok) {
        const conversation = await response.json();
        console.log('Conversation response:', conversation);
        setSelectedChat({
          type: 'friend',
          data: friend,
          conversationId: conversation.id
        });
      } else {
        const errorText = await response.text();
        console.error('Failed to get conversation:', response.status, errorText);
        alert(`Failed to get conversation: ${response.status} - ${errorText}`);
      }
    } catch (error) {
      console.error('Error getting conversation:', error);
      alert('Network error while getting conversation');
    }
  };

  const handleGroupClick = (group: Group) => {
    setSelectedChat({
      type: 'group',
      data: group,
      conversationId: group.id
    });
  };

  const getUserInitials = (firstname: string, lastname: string) => {
    return `${firstname.charAt(0)}${lastname.charAt(0)}`.toUpperCase();
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-80 md:w-80 sm:w-full bg-white border-r border-gray-200 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
                <MessageCircle className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Messenger</h2>
                <p className="text-sm text-gray-500">
                  {user?.firstname} {user?.lastname}
                </p>
              </div>
            </div>
            <div className="flex space-x-1">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <Settings className="h-4 w-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                onClick={logout}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search conversations..."
              className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Conversations List */}
        <ScrollArea className="flex-1">
          <div className="p-2">
            {/* Groups Section */}
            <div className="mb-4">
              <div className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center space-x-2">
                  <Users className="h-4 w-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">Groups</span>
                  <Badge variant="secondary" className="text-xs">
                    {groups.length}
                  </Badge>
                </div>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
              
              {groups.map((group) => (
                <button
                  key={group.id}
                  onClick={() => handleGroupClick(group)}
                  className={`w-full flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 transition-colors ${
                    selectedChat?.type === 'group' && 
                    (selectedChat.data as Group).id === group.id
                      ? 'bg-blue-50 border border-blue-200'
                      : ''
                  }`}
                >
                  <div className="w-10 h-10 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full flex items-center justify-center">
                    <Users className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-medium text-gray-900">{group.name}</p>
                    <p className="text-sm text-gray-500 truncate">Group chat</p>
                  </div>
                </button>
              ))}
            </div>

            <Separator className="my-4" />

            {/* Friends Section */}
            <div>
              <div className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center space-x-2">
                  <MessageCircle className="h-4 w-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">Friends</span>
                  <Badge variant="secondary" className="text-xs">
                    {friends.filter(f => f.active).length}
                  </Badge>
                </div>
              </div>
              
              {friends.map((friend, index) => (
                <button
                  key={index}
                  onClick={() => handleFriendClick(friend)}
                  className={`w-full flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 transition-colors ${
                    selectedChat?.type === 'friend' && 
                    (selectedChat.data as Friend).login === friend.login
                      ? 'bg-blue-50 border border-blue-200'
                      : ''
                  }`}
                >
                  <div className="relative">
                    <Avatar className="w-10 h-10">
                      <AvatarFallback className="bg-gradient-to-r from-blue-500 to-purple-500 text-white">
                        {getUserInitials(friend.firstname, friend.lastname)}
                      </AvatarFallback>
                    </Avatar>
                    {friend.active && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-medium text-gray-900 truncate">
                      {friend.firstname} {friend.lastname}
                    </p>
                    <p className="text-sm text-gray-500">
                      {friend.active ? 'Online' : 'Offline'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col sm:hidden md:flex">
        {selectedChat ? (
          <ChatArea
            chat={selectedChat}
            currentUserId={user?.user_id || 0}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                <MessageCircle className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Select a conversation
              </h3>
              <p className="text-gray-500">
                Choose a friend or group to start messaging
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
