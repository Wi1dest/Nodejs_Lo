const User = require('../models/User');
const Article = require('../models/Article');
const Comment = require('../models/Comment');
const WebInfo = require('../models/WebInfo');
const TreeHole = require('../models/TreeHole');
const PoetryResult = require('../utils/result');
const PoetryCache = require('../utils/cache');
const PoetryUtil = require('../utils/util');
const constants = require('../utils/constants');
const { Op } = require('sequelize');
const articleService = require('./articleService');
const commentService = require('./commentService');
const userService = require('./userService');

class AdminService {
  // 查询用户列表（调用 userService 的方法）
  async listUser(baseRequestVO) {
    return await userService.listUser(baseRequestVO);
  }

  // 修改用户状态
  async changeUserStatus(userId, flag, req) {
    try {
      const user = await User.findByPk(userId);
      if (!user) {
        return PoetryResult.fail('用户不存在！');
      }

      if (flag) {
        // 解禁
        await user.update({ userStatus: true });
      } else {
        // 封禁
        await user.update({ userStatus: false });
      }

      // 退出该用户的所有登录
      this.logout(userId);

      return PoetryResult.success();
    } catch (error) {
      return PoetryResult.fail('操作失败：' + error.message);
    }
  }

  // 修改用户赞赏
  async changeUserAdmire(userId, admire) {
    try {
      await User.update(
        { admire: admire },
        { where: { id: userId } }
      );

      // 清除赞赏缓存
      PoetryCache.remove(constants.ADMIRE);

      return PoetryResult.success();
    } catch (error) {
      return PoetryResult.fail('操作失败：' + error.message);
    }
  }

  // 修改用户类型
  async changeUserType(userId, userType, req) {
    try {
      if (userType !== 0 && userType !== 1 && userType !== 2) {
        return PoetryResult.fail('参数错误！');
      }

      await User.update(
        { userType: userType },
        { where: { id: userId } }
      );

      // 退出该用户的所有登录
      this.logout(userId);

      return PoetryResult.success();
    } catch (error) {
      return PoetryResult.fail('操作失败：' + error.message);
    }
  }

  // 退出用户登录
  async logout(userId) {
    const adminToken = await PoetryCache.get(constants.ADMIN_TOKEN + userId);
    if (adminToken) {
      await PoetryCache.remove(constants.ADMIN_TOKEN + userId);
      await PoetryCache.remove(adminToken);
    }

    const userToken = await PoetryCache.get(constants.USER_TOKEN + userId);
    if (userToken) {
      await PoetryCache.remove(constants.USER_TOKEN + userId);
      await PoetryCache.remove(userToken);
    }
  }

  // 获取管理员网站信息
  async getAdminWebInfo() {
    try {
      const webInfo = await WebInfo.findOne({
        where: { status: true }
      });

      if (webInfo) {
        return PoetryResult.success(webInfo.toJSON());
      }

      return PoetryResult.success(null);
    } catch (error) {
      return PoetryResult.fail('查询失败：' + error.message);
    }
  }

  // 用户查询文章
  async listUserArticle(baseRequestVO, req) {
    try {
      const userId = await PoetryUtil.getUserId(req);
      return await articleService.listAdminArticle(baseRequestVO, false, userId);
    } catch (error) {
      return PoetryResult.fail('查询失败：' + error.message);
    }
  }

  // Boss查询文章
  async listBossArticle(baseRequestVO) {
    try {
      return await articleService.listAdminArticle(baseRequestVO, true);
    } catch (error) {
      return PoetryResult.fail('查询失败：' + error.message);
    }
  }

  // 修改文章状态
  async changeArticleStatus(articleId, viewStatus, commentStatus, recommendStatus, req) {
    try {
      const userId = await PoetryUtil.getUserId(req);
      const updateData = {};

      if (viewStatus !== undefined) updateData.viewStatus = viewStatus;
      if (commentStatus !== undefined) updateData.commentStatus = commentStatus;
      if (recommendStatus !== undefined) updateData.recommendStatus = recommendStatus;

      await Article.update(updateData, {
        where: {
          id: articleId,
          userId: userId
        }
      });

      return PoetryResult.success();
    } catch (error) {
      return PoetryResult.fail('操作失败：' + error.message);
    }
  }

  // 查询文章（管理员）
  async getArticleById(id, req) {
    try {
      return await articleService.getArticleByIdForUser(id, req);
    } catch (error) {
      return PoetryResult.fail('查询失败：' + error.message);
    }
  }

  // 用户删除评论
  async userDeleteComment(id, req) {
    try {
      const comment = await Comment.findByPk(id, {
        attributes: ['id', 'source', 'type']
      });

      if (!comment) {
        return PoetryResult.success();
      }

      if (comment.type !== 'article') {
        return PoetryResult.fail('权限不足！');
      }

      const article = await Article.findOne({
        where: { id: comment.source },
        attributes: ['id', 'userId']
      });

      if (!article) {
        return PoetryResult.fail('文章不存在！');
      }

      const userId = await PoetryUtil.getUserId(req);
      if (article.userId !== userId) {
        return PoetryResult.fail('权限不足！');
      }

      await Comment.destroy({ where: { id: id } });

      return PoetryResult.success();
    } catch (error) {
      return PoetryResult.fail('删除失败：' + error.message);
    }
  }

  // Boss删除评论
  async bossDeleteComment(id) {
    try {
      await Comment.destroy({ where: { id: id } });
      return PoetryResult.success();
    } catch (error) {
      return PoetryResult.fail('删除失败：' + error.message);
    }
  }

  // 用户查询评论
  async listUserComment(baseRequestVO, req) {
    try {
      return await commentService.listAdminComment(baseRequestVO, false, req);
    } catch (error) {
      return PoetryResult.fail('查询失败：' + error.message);
    }
  }

  // Boss查询评论
  async listBossComment(baseRequestVO) {
    try {
      return await commentService.listAdminComment(baseRequestVO, true);
    } catch (error) {
      return PoetryResult.fail('查询失败：' + error.message);
    }
  }

  // Boss查询树洞
  async listBossTreeHole(baseRequestVO) {
    try {
      const page = baseRequestVO.current || baseRequestVO.page || 1;
      const pageSize = baseRequestVO.size || baseRequestVO.pageSize || 10;
      const offset = (page - 1) * pageSize;

      const { count, rows } = await TreeHole.findAndCountAll({
        limit: pageSize,
        offset: offset,
        order: [['create_time', 'DESC']]
      });

      // 格式化返回数据，确保字段名与原版一致
      const records = rows.map(row => {
        const data = row.toJSON ? row.toJSON() : row;
        
        // 构建符合原版格式的对象
        const result = {
          id: data.id,
          avatar: data.avatar || null,
          message: data.message
        };
        
        // 处理日期字段：原版返回 ISO 格式字符串（LocalDateTime 格式，没有时区）
        // 将 create_time 或 createdAt 转换为 createTime（统一转换为东八区）
        let createTime = data.create_time || data.createdAt;
        if (createTime) {
          // 统一转换为 Date 对象处理时区
          const date = new Date(createTime);
          // 转换为东八区时间
          const utcTime = date.getTime() + (date.getTimezoneOffset() * 60 * 1000);
          const beijingTime = new Date(utcTime + (8 * 60 * 60 * 1000));
          const year = beijingTime.getFullYear();
          const month = String(beijingTime.getMonth() + 1).padStart(2, '0');
          const day = String(beijingTime.getDate()).padStart(2, '0');
          const hours = String(beijingTime.getHours()).padStart(2, '0');
          const minutes = String(beijingTime.getMinutes()).padStart(2, '0');
          const seconds = String(beijingTime.getSeconds()).padStart(2, '0');
          
          // 原版格式：2024-12-08T19:31:41（ISO 格式但无毫秒和时区）
          result.createTime = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
        }
        
        return result;
      });

      const result = {
        records: records,
        total: count,
        size: pageSize,
        current: page,
        pages: Math.ceil(count / pageSize)
      };

      return PoetryResult.success(result);
    } catch (error) {
      return PoetryResult.fail('查询失败：' + error.message);
    }
  }
}

module.exports = new AdminService();
