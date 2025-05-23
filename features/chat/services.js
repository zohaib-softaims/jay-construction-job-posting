import { Message } from "../../shared/models/MessageModel.js";
import { Conversation } from "../../shared/models/ConversationModel.js";

export const fetchAllConversations = async (_id) => {
  return await Conversation.find({
    participants: { $in: [_id] },
  })
    .populate("participants", "email role company_name full_name description profile_picture")
    .populate({
      path: "lastMessage",
      select: "sender type content updatedAt",
      populate: {
        path: "sender",
        select: "email role company_name full_name",
      },
    })
    .sort({ updatedAt: -1 });
};

export const fetchChatMessages = async (conversationId) => {
  return await Message.find({ conversation: conversationId }).sort({ createdAt: 1 });
};

export const saveMessage = async (conversationId, message) => {
  if (message.type == "text") {
    const newMessage = new Message({
      conversation: conversationId,
      sender: message.senderId,
      type: message.type,
      content: message.content,
    });
    return await newMessage.save();
  } else if (message.type == "enquiry") {
    const newMessage = new Message({
      conversation: conversationId,
      sender: message.senderId,
      type: message.type,
      enquiry: message.enquiry,
    });
    return await newMessage.save();
  }
};

export const updateConversationLastMessage = async (conversationId, user1, user2, messageId) => {
  let conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    conversation = new Conversation({
      _id: conversationId,
      participants: [user1, user2],
    });
  }

  conversation.lastMessage = messageId;
  await conversation.save();

  const populatedConversation = await Conversation.findById(conversation._id).populate("participants").populate("lastMessage");
  return populatedConversation;
};
