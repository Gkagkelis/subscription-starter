&quot;use client&quot;;
import React, { useState, useRef, useEffect } from &quot;react&quot;;import ReactMarkdown from &quot;react-markdown&quot;;
interface Action {  label: string;  // πρόσθεσε κι άλλα fields αν υπάρχουν στο API σου}
interface Message {  role: &quot;user&quot; | &quot;assistant&quot;;  content: string;  insights?: string[];  actions?: Action[];}
interface Chat {  id: string;  title: string;  messages: Message[];}
const suggestions = [  &quot;Θελω να οργανωσω εκθεση&quot;,  &quot;Βρες μου grants&quot;,  &quot;Αναλυσε τα reviews μου&quot;,  &quot;Προβλεψε το impact&quot;,];
const menuItems = [  { id: &quot;chat&quot;, icon: &quot;/chat_logo.png&quot;, label: &quot;Chat&quot; },  { id: &quot;data&quot;, icon: &quot;/my_data_logo.png&quot;, label: &quot;My Data&quot; },  { id: &quot;projects&quot;, icon: &quot;/project_logo.png&quot;, label: &quot;Projects&quot; },  { id: &quot;grants&quot;, icon: &quot;/Grand_Finder.png&quot;, label: &quot;Grant Finder&quot; },  { id: &quot;impact&quot;, icon: &quot;/Impact_Predictor_logo.png&quot;, label: &quot;Impact Predictor&quot; },  { id: &quot;trends&quot;, icon: &quot;/Trend_Radar_logo.png&quot;, label: &quot;Trend Radar&quot; },];
export default function CopilotPage() {  const [chats, setChats] = useState&lt;Chat[]&gt;([]);  const [activeChat, setActiveChat] = useState&lt;string | null&gt;(null);  const [input, setInput] = useState(&quot;&quot;);  const [loading, setLoading] = useState(false);  const [activeSection, setActiveSection] = useState(&quot;chat&quot;);  const [editingChatId, setEditingChatId] = useState&lt;string | null&gt;(null);  const [editingTitle, setEditingTitle] = useState(&quot;&quot;);  const messagesEndRef = useRef&lt;HTMLDivElement | null&gt;(null);
  const currentChat = chats.find((c) =&gt; c.id === activeChat);  const messages = currentChat?.messages || [];
  useEffect(() =&gt; {    loadChats();  }, []);
  useEffect(() =&gt; {    messagesEndRef.current?.scrollIntoView({ behavior: &quot;smooth&quot; });  }, [messages]);
  const loadChats = async () =&gt; {    try {      const res = await fetch(&quot;/api/chats&quot;);      if (res.ok) {        const data = await res.json();        setChats(data);      }    } catch (error) {      console.error(&quot;Failed to load chats:&quot;, error);    }  };
  const createNewChat = async () =&gt; {    try {      const res = await fetch(&quot;/api/chats&quot;, {        method: &quot;POST&quot;,        headers: { &quot;Content-Type&quot;: &quot;application/json&quot; },        body: JSON.stringify({ title: &quot;Νεο Chat&quot;, messages: [] }),      });
  if (res.ok) {
    const newChat: Chat = await res.json();
    setChats((prev) =&gt; [newChat, ...prev]);
    setActiveChat(newChat.id);
    setActiveSection(&quot;chat&quot;);
  }
} catch (error) {
  console.error(&quot;Failed to create chat:&quot;, error);
}

  };
  const updateChat = async (    chatId: string,    title: string,    messages: Message[]  ) =&gt; {    try {      await fetch(&quot;/api/chats&quot;, {        method: &quot;PUT&quot;,        headers: { &quot;Content-Type&quot;: &quot;application/json&quot; },        body: JSON.stringify({ id: chatId, title, messages }),      });    } catch (error) {      console.error(&quot;Failed to update chat:&quot;, error);    }  };
  const deleteChat = async (chatId: string) =&gt; {    try {      await fetch(&quot;/api/chats&quot;, {        method: &quot;DELETE&quot;,        headers: { &quot;Content-Type&quot;: &quot;application/json&quot; },        body: JSON.stringify({ id: chatId }),      });
  setChats((prev) =&gt; prev.filter((c) =&gt; c.id !== chatId));

  if (activeChat === chatId) {
    setActiveChat(null);
  }
} catch (error) {
  console.error(&quot;Failed to delete chat:&quot;, error);
}

  };
  const startEditingChat = (chatId: string, currentTitle: string) =&gt; {    setEditingChatId(chatId);    setEditingTitle(currentTitle);  };
  const saveEditingChat = async () =&gt; {    if (editingChatId &amp;&amp; editingTitle.trim()) {      const chat = chats.find((c) =&gt; c.id === editingChatId);      if (chat) {        await updateChat(editingChatId, editingTitle.trim(), chat.messages);        setChats((prev) =&gt;          prev.map((c) =&gt;            c.id === editingChatId              ? { ...c, title: editingTitle.trim() }              : c          )        );      }    }    setEditingChatId(null);    setEditingTitle(&quot;&quot;);  };
  const handleSubmit = async (text?: string) =&gt; {    const message = text || input;    if (!message.trim()) return;
let chatId = activeChat;
let isNewChat = false;

if (!chatId) {
  try {
    const res = await fetch(&quot;/api/chats&quot;, {
      method: &quot;POST&quot;,
      headers: { &quot;Content-Type&quot;: &quot;application/json&quot; },
      body: JSON.stringify({
        title: message.slice(0, 25),
        messages: [],
      }),
    });

    if (res.ok) {
      const newChat: Chat = await res.json();
      setChats((prev) =&gt; [newChat, ...prev]);
      setActiveChat(newChat.id);
      chatId = newChat.id;
      isNewChat = true;
    }
  } catch (error) {
    console.error(&quot;Failed to create chat:&quot;, error);
    return;
  }
}

const userMessage: Message = {
  role: &quot;user&quot;,
  content: message,
};

const updatedMessages = [...(isNewChat ? [] : messages), userMessage];

setChats((prev) =&gt;
  prev.map((chat) =&gt;
    chat.id === chatId
      ? { ...chat, messages: updatedMessages }
      : chat
  )
);

setInput(&quot;&quot;);
setLoading(true);

try {
  const res = await fetch(&quot;/api/ai/copilot&quot;, {
    method: &quot;POST&quot;,
    headers: { &quot;Content-Type&quot;: &quot;application/json&quot; },
    body: JSON.stringify({ message, language: &quot;auto&quot; }),
  });

  const data = await res.json();

  const assistantMessage: Message = {
    role: &quot;assistant&quot;,
    content: data.reply,
    insights: data.insights,
    actions: data.actions,
  };

  const finalMessages = [...updatedMessages, assistantMessage];

  setChats((prev) =&gt;
    prev.map((chat) =&gt;
      chat.id === chatId
        ? { ...chat, messages: finalMessages }
        : chat
    )
  );

  const chat = chats.find((c) =&gt; c.id === chatId);
  await updateChat(
    chatId!,
    chat?.title | message.slice(0, 25),
    finalMessages
  );
} catch (error) {
  console.error(error);
} finally {
  setLoading(false);
}

  };
  const handleKeyDown = (e: React.KeyboardEvent) =&gt; {    if (e.key === &quot;Enter&quot; &amp;&amp; !e.shiftKey) {      e.preventDefault();      handleSubmit();    }  };
  return (          {/* Sidebar */}                                    + Νεο Chat                  
    &lt;nav className=&quot;flex-1 overflow-y-auto p-2&quot;&gt;
      {menuItems.map((item) =&gt; (
        &lt;button
          key={item.id}
          onClick={() =&gt; setActiveSection(item.id)}
          className={`w-full text-left px-3 py-2 rounded-lg mb-1 flex items-center gap-3 transition ${
            activeSection === item.id
              ? &quot;bg-zinc-800 text-white&quot;
              : &quot;text-zinc-400 hover:bg-zinc-900 hover:text-white&quot;
          }`}
        &gt;
          &lt;img src={item.icon} alt={item.label} className=&quot;w-5 h-5&quot; /&gt;
          &lt;span className=&quot;text-sm&quot;&gt;{item.label}&lt;/span&gt;
        &lt;/button&gt;
      ))}

      {chats.length &gt; 0 &amp;&amp; (
        &lt;div className=&quot;mt-4 pt-4 border-t border-zinc-800&quot;&gt;
          &lt;p className=&quot;text-xs text-zinc-600 px-3 mb-2&quot;&gt;
            RECENT CHATS
          &lt;/p&gt;

          {chats.map((chat) =&gt; (
            &lt;div key={chat.id} className=&quot;relative group&quot;&gt;
              {editingChatId === chat.id ? (
                &lt;input
                  type=&quot;text&quot;
                  value={editingTitle}
                  onChange={(e) =&gt; setEditingTitle(e.target.value)}
                  onBlur={saveEditingChat}
                  onKeyDown={(e) =&gt;
                    e.key === &quot;Enter&quot; &amp;&amp; saveEditingChat()
                  }
                  autoFocus
                  className=&quot;w-full px-3 py-2 bg-zinc-800 text-white rounded-lg text-sm border border-zinc-600 focus:outline-none&quot;
                /&gt;
              ) : (
                &lt;div className=&quot;flex items-center&quot;&gt;
                  &lt;button
                    onClick={() =&gt; {
                      setActiveChat(chat.id);
                      setActiveSection(&quot;chat&quot;);
                    }}
                    onDoubleClick={() =&gt;
                      startEditingChat(chat.id, chat.title)
                    }
                    className={`flex-1 text-left px-3 py-2 rounded-lg text-sm truncate transition ${
                      activeChat === chat.id
                        ? &quot;bg-zinc-800 text-white&quot;
                        : &quot;text-zinc-500 hover:bg-zinc-900&quot;
                    }`}
                  &gt;
                    {chat.title}
                  &lt;/button&gt;
                  &lt;button
                    onClick={() =&gt; deleteChat(chat.id)}
                    className=&quot;opacity-0 group-hover:opacity-100 px-2 text-zinc-600 hover:text-red-500 transition&quot;
                  &gt;
                    ×
                  &lt;/button&gt;
                &lt;/div&gt;
              )}
            &lt;/div&gt;
          ))}
        &lt;/div&gt;
      )}
    &lt;/nav&gt;
  &lt;/div&gt;

  {/* Main content */}
  &lt;div className=&quot;flex-1 flex flex-col&quot;&gt;
    {/* CHAT SECTION */}
    {activeSection === &quot;chat&quot; &amp;&amp; (
      &lt;&gt;
        {messages.length === 0 ? (
          &lt;div className=&quot;flex-1 flex flex-col items-center justify-center px-6&quot;&gt;
            &lt;img
              src=&quot;/axiprova-icon.png&quot;
              alt=&quot;Axiprova&quot;
              className=&quot;w-20 h-20 mb-4&quot;
            /&gt;
            &lt;h1 className=&quot;text-xl font-light text-zinc-300 mb-1&quot;&gt;
              Axiprova
            &lt;/h1&gt;
            &lt;p className=&quot;text-zinc-500 text-center mb-6&quot;&gt;
              Ο AI συμβουλος σου για τον πολιτισμο
            &lt;/p&gt;

            &lt;div className=&quot;flex flex-wrap justify-center gap-2 mb-6&quot;&gt;
              {suggestions.map((s, i) =&gt; (
                &lt;button
                  key={i}
                  onClick={() =&gt; handleSubmit(s)}
                  className=&quot;px-4 py-2 text-sm bg-zinc-900 text-zinc-400 border border-zinc-800 rounded-full hover:bg-zinc-800 hover:text-white transition&quot;
                &gt;
                  {s}
                &lt;/button&gt;
              ))}
            &lt;/div&gt;

            &lt;div className=&quot;w-full max-w-2xl flex gap-3&quot;&gt;
              &lt;input
                type=&quot;text&quot;
                value={input}
                onChange={(e) =&gt; setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder=&quot;Ρωτησε οτιδηποτε...&quot;
                className=&quot;flex-1 bg-zinc-900 text-white px-4 py-3 rounded-xl border border-zinc-800 focus:outline-none focus:border-zinc-600 placeholder-zinc-600&quot;
              /&gt;
              &lt;button
                onClick={() =&gt; handleSubmit()}
                disabled={loading || !input.trim()}
                className=&quot;px-6 py-3 bg-white text-black font-medium rounded-xl hover:bg-zinc-200 disabled:opacity-50 transition&quot;
              &gt;
                Στειλε
              &lt;/button&gt;
            &lt;/div&gt;
          &lt;/div&gt;
        ) : (
          &lt;&gt;
            &lt;div className=&quot;flex-1 overflow-y-auto px-6 py-4&quot;&gt;
              &lt;div className=&quot;max-w-2xl mx-auto&quot;&gt;
                {messages.map((msg, i) =&gt; (
                  &lt;div key={i} className=&quot;mb-6&quot;&gt;
                    {msg.role === &quot;user&quot; ? (
                      &lt;div className=&quot;flex justify-end&quot;&gt;
                        &lt;div className=&quot;bg-zinc-800 text-white px-4 py-3 rounded-2xl rounded-br-md max-w-lg&quot;&gt;
                          {msg.content}
                        &lt;/div&gt;
                      &lt;/div&gt;
                    ) : (
                      &lt;div className=&quot;flex gap-3&quot;&gt;
                        &lt;img
                          src=&quot;/axiprova-icon.png&quot;
                          alt=&quot;AI&quot;
                          className=&quot;w-8 h-8 flex-shrink-0 mt-1&quot;
                        /&gt;
                        &lt;div className=&quot;flex-1 space-y-4&quot;&gt;
                          &lt;div className=&quot;text-zinc-200 leading-relaxed prose prose-invert prose-sm max-w-none&quot;&gt;
                            &lt;ReactMarkdown
                              components={{
                                a: ({ href, children }) =&gt; (
                                  &lt;a
                                    href={href ?? &quot;#&quot;}
                                    target=&quot;_blank&quot;
                                    rel=&quot;noopener noreferrer&quot;
                                    className=&quot;text-blue-400 hover:text-blue-300 underline&quot;
                                  &gt;
                                    {children}
                                  &lt;/a&gt;
                                ),
                              }}
                            &gt;
                              {msg.content}
                            &lt;/ReactMarkdown&gt;
                          &lt;/div&gt;

                          {msg.insights &amp;&amp; msg.insights.length &gt; 0 &amp;&amp; (
                            &lt;div className=&quot;bg-zinc-900/50 border border-zinc-800 rounded-xl p-4&quot;&gt;
                              &lt;p className=&quot;text-zinc-500 text-xs uppercase mb-2&quot;&gt;
                                Insights
                              &lt;/p&gt;
                              &lt;ul className=&quot;space-y-1&quot;&gt;
                                {msg.insights.map((insight, j) =&gt; (
                                  &lt;li
                                    key={j}
                                    className=&quot;text-zinc-400 text-sm flex items-start&quot;
                                  &gt;
                                    &lt;span className=&quot;text-blue-400 mr-2&quot;&gt;
                                      →
                                    &lt;/span&gt;
                                    {insight}
                                  &lt;/li&gt;
                                ))}
                              &lt;/ul&gt;
                            &lt;/div&gt;
                          )}

                          {msg.actions &amp;&amp; msg.actions.length &gt; 0 &amp;&amp; (
                            &lt;div className=&quot;flex flex-wrap gap-2&quot;&gt;
                              {msg.actions.map((action, j) =&gt; (
                                &lt;button
                                  key={j}
                                  onClick={() =&gt;
                                    handleSubmit(action.label)
                                  }
                                  className=&quot;px-3 py-1.5 text-sm bg-zinc-900 text-zinc-400 border border-zinc-700 rounded-full hover:bg-zinc-800 hover:text-white transition&quot;
                                &gt;
                                  {action.label}
                                &lt;/button&gt;
                              ))}
                            &lt;/div&gt;
                          )}
                        &lt;/div&gt;
                      &lt;/div&gt;
                    )}
                  &lt;/div&gt;
                ))}

                {loading &amp;&amp; (
                  &lt;div className=&quot;flex gap-3 mb-6&quot;&gt;
                    &lt;img
                      src=&quot;/axiprova-icon.png&quot;
                      alt=&quot;AI&quot;
                      className=&quot;w-8 h-8 flex-shrink-0&quot;
                    /&gt;
                    &lt;div className=&quot;text-zinc-500&quot;&gt;Σκεφτομαι...&lt;/div&gt;
                  &lt;/div&gt;
                )}

                &lt;div ref={messagesEndRef} /&gt;
              &lt;/div&gt;
            &lt;/div&gt;

            &lt;div className=&quot;border-t border-zinc-800 bg-zinc-950 px-6 py-4&quot;&gt;
              &lt;div className=&quot;max-w-2xl mx-auto flex gap-3&quot;&gt;
                &lt;input
                  type=&quot;text&quot;
                  value={input}
                  onChange={(e) =&gt; setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder=&quot;Ρωτησε οτιδηποτε...&quot;
                  className=&quot;flex-1 bg-zinc-900 text-white px-4 py-3 rounded-xl border border-zinc-800 focus:outline-none focus:border-zinc-600 placeholder-zinc-600&quot;
                /&gt;
                &lt;button
                  onClick={() =&gt; handleSubmit()}
                  disabled={loading || !input.trim()}
                  className=&quot;px-6 py-3 bg-white text-black font-medium rounded-xl hover:bg-zinc-200 disabled:opacity-50 transition&quot;
                &gt;
                  Στειλε
                &lt;/button&gt;
              &lt;/div&gt;
            &lt;/div&gt;
          &lt;/&gt;
        )}
      &lt;/&gt;
    )}

    {/* DATA SECTION */}
    {activeSection === &quot;data&quot; &amp;&amp; (
      &lt;div className=&quot;flex-1 flex items-center justify-center&quot;&gt;
        &lt;div className=&quot;text-center&quot;&gt;
          &lt;img
            src=&quot;/my_data_logo.png&quot;
            alt=&quot;My Data&quot;
            className=&quot;w-20 h-20 mx-auto mb-4&quot;
          /&gt;
          &lt;h2 className=&quot;text-2xl font-bold text-white mb-2&quot;&gt;My Data&lt;/h2&gt;
          &lt;p className=&quot;text-zinc-500 mb-6&quot;&gt;Διαχειρισου τα reviews σου&lt;/p&gt;
          &lt;a
            href=&quot;/dashboard/data&quot;
            className=&quot;px-6 py-3 bg-white text-black font-medium rounded-xl hover:bg-zinc-200 transition inline-block&quot;
          &gt;
            Ανοιξε
          &lt;/a&gt;
        &lt;/div&gt;
      &lt;/div&gt;
    )}

    {/* PROJECTS SECTION */}
    {activeSection === &quot;projects&quot; &amp;&amp; (
      &lt;div className=&quot;flex-1 flex items-center justify-center&quot;&gt;
        &lt;div className=&quot;text-center&quot;&gt;
          &lt;img
            src=&quot;/project_logo.png&quot;
            alt=&quot;Projects&quot;
            className=&quot;w-20 h-20 mx-auto mb-4&quot;
          /&gt;
          &lt;h2 className=&quot;text-2xl font-bold text-white mb-2&quot;&gt;
            Projects
          &lt;/h2&gt;
          &lt;p className=&quot;text-zinc-500 mb-6&quot;&gt;
            Οργανωσε τα projects σου
          &lt;/p&gt;
          &lt;span className=&quot;px-4 py-2 bg-zinc-800 text-zinc-400 rounded-full text-sm&quot;&gt;
            Coming Soon
          &lt;/span&gt;
        &lt;/div&gt;
      &lt;/div&gt;
    )}

    {/* GRANTS SECTION */}
    {activeSection === &quot;grants&quot; &amp;&amp; (
      &lt;div className=&quot;flex-1 flex items-center justify-center&quot;&gt;
        &lt;div className=&quot;text-center&quot;&gt;
          &lt;img
            src=&quot;/Grand_Finder.png&quot;
            alt=&quot;Grant Finder&quot;
            className=&quot;w-20 h-20 mx-auto mb-4&quot;
          /&gt;
          &lt;h2 className=&quot;text-2xl font-bold text-white mb-2&quot;&gt;
            Grant Finder
          &lt;/h2&gt;
          &lt;p className=&quot;text-zinc-500 mb-6&quot;&gt;Βρες χρηματοδοτησεις&lt;/p&gt;
          &lt;span className=&quot;px-4 py-2 bg-zinc-800 text-zinc-400 rounded-full text-sm&quot;&gt;
            Coming Soon
          &lt;/span&gt;
        &lt;/div&gt;
      &lt;/div&gt;
    )}

    {/* IMPACT SECTION */}
    {activeSection === &quot;impact&quot; &amp;&amp; (
      &lt;div className=&quot;flex-1 flex items-center justify-center&quot;&gt;
        &lt;div className=&quot;text-center&quot;&gt;
          &lt;img
            src=&quot;/Impact_Predictor_logo.png&quot;
            alt=&quot;Impact Predictor&quot;
            className=&quot;w-20 h-20 mx-auto mb-4&quot;
          /&gt;
          &lt;h2 className=&quot;text-2xl font-bold text-white mb-2&quot;&gt;
            Impact Predictor
          &lt;/h2&gt;
          &lt;p className=&quot;text-zinc-500 mb-6&quot;&gt;
            Προβλεψε την επιτυχια σου
          &lt;/p&gt;
          &lt;span className=&quot;px-4 py-2 bg-zinc-800 text-zinc-400 rounded-full text-sm&quot;&gt;
            Coming Soon
          &lt;/span&gt;
        &lt;/div&gt;
      &lt;/div&gt;
    )}

    {/* TRENDS SECTION */}
    {activeSection === &quot;trends&quot; &amp;&amp; (
      &lt;div className=&quot;flex-1 flex items-center justify-center&quot;&gt;
        &lt;div className=&quot;text-center&quot;&gt;
          &lt;img
            src=&quot;/Trend_Radar_logo.png&quot;
            alt=&quot;Trend Radar&quot;
            className=&quot;w-20 h-20 mx-auto mb-4&quot;
          /&gt;
          &lt;h2 className=&quot;text-2xl font-bold text-white mb-2&quot;&gt;
            Trend Radar
          &lt;/h2&gt;
          &lt;p className=&quot;text-zinc-500 mb-6&quot;&gt;Δες τι ειναι trending&lt;/p&gt;
          &lt;span className=&quot;px-4 py-2 bg-zinc-800 text-zinc-400 rounded-full text-sm&quot;&gt;
            Coming Soon
          &lt;/span&gt;
        &lt;/div&gt;
      &lt;/div&gt;
    )}
  &lt;/div&gt;
&lt;/div&gt;

  );}
