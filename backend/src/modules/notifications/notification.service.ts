import { Notification, type INotification } from './notification.model.js';
import mongoose from 'mongoose';

export class NotificationService {
  static async listUserNotifications(userId: string) {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const [notifications, unreadCount] = await Promise.all([
      Notification.find({ userId: userObjectId }).sort({ createdAt: -1 }).limit(50).lean(),
      Notification.countDocuments({ userId: userObjectId, isRead: false }),
    ]);

    return {
      notifications: notifications.map((n) => ({
        id: n._id.toString(),
        title: n.title,
        message: n.message,
        type: n.type,
        isRead: n.isRead,
        data: n.data,
        createdAt: n.createdAt,
      })),
      unreadCount,
    };
  }

  static async markAsRead(userId: string, notificationId: string) {
    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      const err: any = new Error('Invalid notification ID');
      err.statusCode = 400;
      err.code = 'INVALID_ID';
      throw err;
    }

    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, userId },
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      const err: any = new Error('Notification not found');
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    return {
      id: notification._id.toString(),
      isRead: notification.isRead,
    };
  }

  static async markAllAsRead(userId: string) {
    const result = await Notification.updateMany({ userId, isRead: false }, { isRead: true });
    return {
      updatedCount: result.modifiedCount,
    };
  }

  static async deleteNotification(userId: string, notificationId: string) {
    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      const err: any = new Error('Invalid notification ID');
      err.statusCode = 400;
      err.code = 'INVALID_ID';
      throw err;
    }

    const deleted = await Notification.findOneAndDelete({ _id: notificationId, userId });
    if (!deleted) {
      const err: any = new Error('Notification not found');
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    return { success: true };
  }

  static async clearAllNotifications(userId: string) {
    const result = await Notification.deleteMany({ userId });
    return {
      deletedCount: result.deletedCount,
    };
  }

  static async createNotification(
    userId: string | mongoose.Types.ObjectId,
    title: string,
    message: string,
    type: 'inquiry' | 'match' | 'deal' | 'system' = 'system',
    data?: Record<string, any>
  ): Promise<INotification> {
    return Notification.create({
      userId,
      title,
      message,
      type,
      data: data || {},
    });
  }
}
