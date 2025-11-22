const Article = require('../models/Article');
const Sort = require('../models/Sort');
const Label = require('../models/Label');
const User = require('../models/User');
const Comment = require('../models/Comment');
const PoetryResult = require('../utils/result');
const PoetryCache = require('../utils/cache');
const PoetryUtil = require('../utils/util');
const constants = require('../utils/constants');
const { Op } = require('sequelize');
const { Sequelize } = require('sequelize');

class ArticleService {
  // 保存文章
  async saveArticle(articleVO, req) {
    try {
      if (articleVO.viewStatus === false && !articleVO.password) {
        return PoetryResult.fail('请设置文章密码！');
      }

      const userId = await PoetryUtil.getUserId(req);
      const articleData = {
        userId: userId,
        sortId: articleVO.sortId,
        labelId: articleVO.labelId,
        articleTitle: articleVO.articleTitle,
        articleContent: articleVO.articleContent,
        viewStatus: articleVO.viewStatus !== undefined ? articleVO.viewStatus : true,
        commentStatus: articleVO.commentStatus !== undefined ? articleVO.commentStatus : true,
        recommendStatus: articleVO.recommendStatus !== undefined ? articleVO.recommendStatus : false,
        viewCount: 0,
        likeCount: 0,
        deleted: false
      };

      if (articleVO.articleCover) {
        articleData.articleCover = articleVO.articleCover;
      }

      if (articleVO.videoUrl) {
        articleData.videoUrl = articleVO.videoUrl;
      }

      if (articleVO.viewStatus === false && articleVO.password) {
        articleData.password = articleVO.password;
        articleData.tips = articleVO.tips;
      }

      await Article.create(articleData);

      // 清除缓存
      PoetryCache.remove(constants.USER_ARTICLE_LIST + userId);
      PoetryCache.remove(constants.ARTICLE_LIST);
      PoetryCache.remove(constants.SORT_ARTICLE_LIST);

      return PoetryResult.success();
    } catch (error) {
      console.error('Save article error:', error);
      return PoetryResult.fail('保存失败：' + error.message);
    }
  }

  // 删除文章
  async deleteArticle(id, req) {
    try {
      const userId = await PoetryUtil.getUserId(req);
      await Article.update(
        { deleted: true },
        {
          where: {
            id: id,
            userId: userId
          }
        }
      );

      // 清除缓存
      PoetryCache.remove(constants.USER_ARTICLE_LIST + userId);
      PoetryCache.remove(constants.ARTICLE_LIST);
      PoetryCache.remove(constants.SORT_ARTICLE_LIST);

      return PoetryResult.success();
    } catch (error) {
      return PoetryResult.fail('删除失败：' + error.message);
    }
  }

  // 更新文章
  async updateArticle(articleVO, req) {
    try {
      if (articleVO.viewStatus === false && !articleVO.password) {
        return PoetryResult.fail('请设置文章密码！');
      }

      const userId = await PoetryUtil.getUserId(req);
      const updateData = {};

      if (articleVO.articleTitle) updateData.articleTitle = articleVO.articleTitle;
      if (articleVO.articleContent) updateData.articleContent = articleVO.articleContent;
      if (articleVO.articleCover !== undefined) updateData.articleCover = articleVO.articleCover;
      if (articleVO.videoUrl !== undefined) updateData.videoUrl = articleVO.videoUrl;
      if (articleVO.viewStatus !== undefined) updateData.viewStatus = articleVO.viewStatus;
      if (articleVO.commentStatus !== undefined) updateData.commentStatus = articleVO.commentStatus;
      if (articleVO.recommendStatus !== undefined) updateData.recommendStatus = articleVO.recommendStatus;
      if (articleVO.sortId) updateData.sortId = articleVO.sortId;
      if (articleVO.labelId) updateData.labelId = articleVO.labelId;
      if (articleVO.password) updateData.password = articleVO.password;
      if (articleVO.tips !== undefined) updateData.tips = articleVO.tips;

      await Article.update(updateData, {
        where: {
          id: articleVO.id,
          userId: userId
        }
      });

      // 清除缓存
      PoetryCache.remove(constants.ARTICLE_LIST);
      PoetryCache.remove(constants.SORT_ARTICLE_LIST);

      return PoetryResult.success();
    } catch (error) {
      return PoetryResult.fail('更新失败：' + error.message);
    }
  }

  // 查询文章列表
  async listArticle(baseRequestVO) {
    try {
      const page = baseRequestVO.page || 1;
      const pageSize = baseRequestVO.pageSize || 10;
      const offset = (page - 1) * pageSize;

      const where = {
        deleted: false,
        viewStatus: true
      };

      // 可以添加搜索条件
      if (baseRequestVO.search || baseRequestVO.searchKey) {
        const searchKey = baseRequestVO.search || baseRequestVO.searchKey;
        where[Op.or] = [
          { articleTitle: { [Op.like]: `%${searchKey}%` } },
          { articleContent: { [Op.like]: `%${searchKey}%` } }
        ];
      }

      if (baseRequestVO.sortId) {
        where.sortId = baseRequestVO.sortId;
      }

      if (baseRequestVO.labelId) {
        where.labelId = baseRequestVO.labelId;
      }

      if (baseRequestVO.recommendStatus) {
        where.recommendStatus = baseRequestVO.recommendStatus;
      }

      const { count, rows } = await Article.findAndCountAll({
        where,
        limit: pageSize,
        offset: offset,
        order: [['create_time', 'DESC']]
      });

      // 批量构建 ArticleVO 列表
      const articleVOList = await this.buildArticleVOList(rows, false);

      const result = {
        records: articleVOList,
        total: count,
        size: pageSize,
        current: page,
        pages: Math.ceil(count / pageSize)
      };

      return PoetryResult.success(result);
    } catch (error) {
      console.error('List article error:', error);
      return PoetryResult.fail('查询失败：' + error.message);
    }
  }

  // 格式化日期为 yyyy-MM-dd HH:mm:ss (东八区)
  formatDateTime(date) {
    if (!date) return null;
    const d = new Date(date);
    // 转换为东八区时间（UTC+8，即加8小时）
    const utcTime = d.getTime() + (d.getTimezoneOffset() * 60 * 1000);
    const beijingTime = new Date(utcTime + (8 * 60 * 60 * 1000));
    
    const year = beijingTime.getFullYear();
    const month = String(beijingTime.getMonth() + 1).padStart(2, '0');
    const day = String(beijingTime.getDate()).padStart(2, '0');
    const hours = String(beijingTime.getHours()).padStart(2, '0');
    const minutes = String(beijingTime.getMinutes()).padStart(2, '0');
    const seconds = String(beijingTime.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  // 批量构建 ArticleVO 列表（优化性能）
  async buildArticleVOList(articles, isAdmin = false) {
    if (!articles || articles.length === 0) return [];

    // 收集所有需要查询的ID
    const userIds = [...new Set(articles.map(a => (a.toJSON ? a.toJSON() : a).userId))];
    const sortIds = [...new Set(articles.map(a => (a.toJSON ? a.toJSON() : a).sortId).filter(Boolean))];
    const labelIds = [...new Set(articles.map(a => (a.toJSON ? a.toJSON() : a).labelId).filter(Boolean))];
    const articleIds = articles.map(a => (a.toJSON ? a.toJSON() : a).id);

    // 批量查询所有数据
    const [users, sorts, labels, commentCounts] = await Promise.all([
      User.findAll({ where: { id: userIds } }),
      sortIds.length > 0 ? Sort.findAll({ where: { id: sortIds } }) : [],
      labelIds.length > 0 ? Label.findAll({ where: { id: labelIds } }) : [],
      Comment.findAll({
        where: { source: articleIds, type: 'article' },
        attributes: ['source', [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']],
        group: ['source'],
        raw: true
      })
    ]);

    // 批量统计 Sort 和 Label 的文章数
    const [sortCounts, labelCounts] = await Promise.all([
      sortIds.length > 0 ? Article.findAll({
        where: { sortId: sortIds, deleted: false },
        attributes: ['sortId', [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']],
        group: ['sortId'],
        raw: true
      }) : [],
      labelIds.length > 0 ? Article.findAll({
        where: { labelId: labelIds, deleted: false },
        attributes: ['labelId', [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']],
        group: ['labelId'],
        raw: true
      }) : []
    ]);

    // 转换为 Map 以便快速查找
    const userMap = new Map(users.map(u => [u.id, u]));
    const sortMap = new Map(sorts.map(s => [s.id, s]));
    const labelMap = new Map(labels.map(l => [l.id, l]));
    const commentCountMap = new Map(commentCounts.map(c => [c.source, parseInt(c.count)]));
    const sortCountMap = new Map(sortCounts.map(s => [s.sortId, parseInt(s.count)]));
    const labelCountMap = new Map(labelCounts.map(l => [l.labelId, parseInt(l.count)]));

    // 构建所有 ArticleVO
    return articles.map(article => {
      const articleData = article.toJSON ? article.toJSON() : article;
      
      const articleVO = {
        id: articleData.id,
        userId: articleData.userId,
        articleCover: articleData.articleCover,
        articleTitle: articleData.articleTitle,
        articleContent: articleData.articleContent,
        viewCount: articleData.viewCount,
        likeCount: articleData.likeCount,
        commentStatus: articleData.commentStatus,
        recommendStatus: articleData.recommendStatus,
        videoUrl: articleData.videoUrl || null,
        password: articleData.password || null,
        tips: articleData.tips || null,
        viewStatus: articleData.viewStatus,
        createTime: this.formatDateTime(articleData.createTime || articleData.create_time),
        updateTime: this.formatDateTime(articleData.updateTime || articleData.update_time),
        updateBy: articleData.updateBy || null,
        sortId: articleData.sortId,
        labelId: articleData.labelId
      };

      // 截取内容
      if (isAdmin && articleVO.articleContent && articleVO.articleContent.length > constants.SUMMARY) {
        articleVO.articleContent = articleVO.articleContent
          .substring(0, constants.SUMMARY)
          .replace(/`/g, '')
          .replace(/#/g, '')
          .replace(/>/g, '');
      }

      // 设置用户名
      const user = userMap.get(articleVO.userId);
      articleVO.username = user ? user.username : null;

      // 设置评论数
      articleVO.commentCount = articleVO.commentStatus ? (commentCountMap.get(articleVO.id) || 0) : 0;

      // 设置 Sort 信息
      if (articleVO.sortId) {
        const sort = sortMap.get(articleVO.sortId);
        if (sort) {
          const sortData = sort.toJSON ? sort.toJSON() : sort;
          sortData.countOfSort = sortCountMap.get(articleVO.sortId) || 0;
          sortData.labels = null;
          articleVO.sort = sortData;
        }
      }

      // 设置 Label 信息
      if (articleVO.labelId) {
        const label = labelMap.get(articleVO.labelId);
        if (label) {
          const labelData = label.toJSON ? label.toJSON() : label;
          labelData.countOfLabel = labelCountMap.get(articleVO.labelId) || 0;
          articleVO.label = labelData;
        }
      }

      return articleVO;
    });
  }

  // 构建 ArticleVO（按照原版Java的buildArticleVO方法）
  async buildArticleVO(article, isAdmin = false, sortInfoCache = null) {
    // 确保 article 是纯对象
    const articleData = article.toJSON ? article.toJSON() : article;
    
    // 构建 ArticleVO，按原版顺序排列字段
    const articleVO = {
      id: articleData.id,
      userId: articleData.userId,
      articleCover: articleData.articleCover,
      articleTitle: articleData.articleTitle,
      articleContent: articleData.articleContent,
      viewCount: articleData.viewCount,
      likeCount: articleData.likeCount,
      commentStatus: articleData.commentStatus,
      recommendStatus: articleData.recommendStatus,
      videoUrl: articleData.videoUrl || null,
      password: articleData.password || null,
      tips: articleData.tips || null,
      viewStatus: articleData.viewStatus,
      createTime: null,
      updateTime: null,
      updateBy: articleData.updateBy || null,
      sortId: articleData.sortId,
      labelId: articleData.labelId
    };
    
    // 格式化日期
    if (articleData.createTime || articleData.create_time) {
      articleVO.createTime = this.formatDateTime(articleData.createTime || articleData.create_time);
    }
    if (articleData.updateTime || articleData.update_time) {
      articleVO.updateTime = this.formatDateTime(articleData.updateTime || articleData.update_time);
    }
    
    // 如果 articleContent 长度 > SUMMARY，且 isAdmin = true（列表接口），截取并清理格式
    if (isAdmin && articleVO.articleContent && articleVO.articleContent.length > constants.SUMMARY) {
      articleVO.articleContent = articleVO.articleContent
        .substring(0, constants.SUMMARY)
        .replace(/`/g, '')
        .replace(/#/g, '')
        .replace(/>/g, '');
    }
    
    // 获取用户信息
    const user = await User.findByPk(articleVO.userId);
    if (user && user.username) {
      articleVO.username = user.username;
    } else {
      articleVO.username = null;
    }
    
    // 获取评论数量
    if (articleVO.commentStatus) {
      const commentCount = await Comment.count({
        where: {
          source: articleVO.id,
          type: 'article'
        }
      });
      articleVO.commentCount = commentCount;
    } else {
      articleVO.commentCount = 0;
    }
    
    // 使用传入的 sortInfo 或查询
    let sortInfo = sortInfoCache;
    if (!sortInfo) {
      sortInfo = await this.getSortInfoData();
    }
    
    if (sortInfo && Array.isArray(sortInfo)) {
      for (const s of sortInfo) {
        if (s.id === articleVO.sortId) {
          // 先保存 labels，用于查找对应的 label
          const labels = s.labels;
          
          // 复制 sort 信息，但不包含 labels
          const sort = { ...s };
          sort.labels = null;
          articleVO.sort = sort;
          
          // 查找对应的 label
          if (labels && Array.isArray(labels)) {
            for (const l of labels) {
              if (l.id === articleVO.labelId) {
                articleVO.label = { ...l };
                break;
              }
            }
          }
          break;
        }
      }
    }
    
    return articleVO;
  }

  // 查询分类文章列表
  async listSortArticle() {
    try {
      const sorts = await Sort.findAll({
        where: {
          sortType: 1
        },
        order: [['priority', 'ASC']]
      });

      const result = {};
      for (const sort of sorts) {
        const articles = await Article.findAll({
          where: {
            sortId: sort.id,
            deleted: false,
            viewStatus: true
          },
          limit: 6,
          order: [['create_time', 'DESC']]
        });

        if (articles && articles.length > 0) {
          // 批量构建 ArticleVO
          const articleVOList = await this.buildArticleVOList(articles, false);
          result[sort.id] = articleVOList;
        }
      }

      return PoetryResult.success(result);
    } catch (error) {
      console.error('List sort article error:', error);
      return PoetryResult.fail('查询失败：' + error.message);
    }
  }

  // 根据ID查询文章
  async getArticleById(id, password = null) {
    try {
      const article = await Article.findOne({
        where: {
          id: id,
          deleted: false
        }
      });

      if (!article) {
        return PoetryResult.success(null);
      }

      // 检查密码保护
      const articleData = article.toJSON ? article.toJSON() : article;
      if (articleData.viewStatus === false) {
        if (!password || password !== articleData.password) {
          const tips = articleData.tips ? articleData.tips : '请联系作者获取密码';
          return PoetryResult.fail('密码错误' + tips);
        }
      }

      // 增加浏览量
      await article.increment('viewCount');
      
      // 重新获取文章以获取更新后的 viewCount
      const updatedArticle = await Article.findByPk(id);
      const updatedData = updatedArticle.toJSON ? updatedArticle.toJSON() : updatedArticle;
      
      // 设置密码为 null（原版逻辑）
      updatedData.password = null;
      
      // 处理 videoUrl 加密（如果需要）
      // 原版会加密 videoUrl，但这里暂时不处理
      
      // 使用 buildArticleVO 构建完整的文章VO（isAdmin = false，用于前台接口）
      const articleVO = await this.buildArticleVO(updatedData, false);
      
      // getArticleById 返回完整内容，不截取
      // 确保 articleContent 是完整的
      articleVO.articleContent = updatedData.articleContent;
      
      return PoetryResult.success(articleVO);
    } catch (error) {
      return PoetryResult.fail('查询失败：' + error.message);
    }
  }
  // 管理员查询文章列表
  async listAdminArticle(baseRequestVO, isBoss, userId = null) {
    try {
      const page = baseRequestVO.page || 1;
      const pageSize = baseRequestVO.pageSize || 10;
      const offset = (page - 1) * pageSize;

      const where = {
        deleted: false
      };

      if (!isBoss && userId) {
        where.userId = userId;
      } else if (isBoss && baseRequestVO.userId) {
        where.userId = baseRequestVO.userId;
      }

      if (baseRequestVO.searchKey) {
        where.articleTitle = {
          [Op.like]: `%${baseRequestVO.searchKey}%`
        };
      }

      if (baseRequestVO.recommendStatus === true || baseRequestVO.recommendStatus === 1) {
        where.recommendStatus = true;
      }

      if (baseRequestVO.labelId) {
        where.labelId = baseRequestVO.labelId;
      }

      if (baseRequestVO.sortId) {
        where.sortId = baseRequestVO.sortId;
      }

      const { count, rows } = await Article.findAndCountAll({
        where,
        attributes: { exclude: ['articleContent'] }, // 不返回文章内容
        limit: pageSize,
        offset: offset,
        order: [['create_time', 'DESC']]
      });

      // 构建文章VO列表
      const records = [];
      for (const article of rows) {
        // 确保 article 是纯对象
        const articleData = article.toJSON ? article.toJSON() : article;
        const articleVO = await this.buildArticleVO(articleData);
        articleVO.password = null; // 管理界面不返回密码
        records.push(articleVO);
      }

      const result = {
        records: records,
        total: count,
        size: pageSize,
        current: page,
        pages: Math.ceil(count / pageSize)
      };

      return PoetryResult.success(result);
    } catch (error) {
      console.error('List admin article error:', error);
      return PoetryResult.fail('查询失败：' + error.message);
    }
  }

  // 用户查询文章详情（编辑用）
  async getArticleByIdForUser(id, req) {
    try {
      const userId = await PoetryUtil.getUserId(req);
      const article = await Article.findOne({
        where: {
          id: id,
          userId: userId,
          deleted: false
        }
      });

      if (!article) {
        return PoetryResult.fail('文章不存在！');
      }

      // 确保 article 是纯对象
      const articleData = article.toJSON ? article.toJSON() : article;
      const articleVO = await this.buildArticleVO(articleData);
      return PoetryResult.success(articleVO);
    } catch (error) {
      return PoetryResult.fail('查询失败：' + error.message);
    }
  }

  // 获取分类信息数据（内部方法）
  async getSortInfoData() {
    try {
      const sorts = await Sort.findAll({
        order: [['priority', 'ASC'], ['id', 'ASC']]
      });

      if (sorts && sorts.length > 0) {
        const result = [];

        for (const sort of sorts) {
          const sortData = sort.toJSON();

          // 统计该分类下的文章数量
          const articleCount = await Article.count({
            where: {
              sortId: sort.id,
              deleted: false
            }
          });
          sortData.countOfSort = articleCount;

          // 查询该分类下的所有标签
          const labels = await Label.findAll({
            where: {
              sortId: sort.id
            }
          });

          if (labels && labels.length > 0) {
            const labelsWithCount = [];
            for (const label of labels) {
              const labelData = label.toJSON();

              // 统计该标签下的文章数量
              const labelArticleCount = await Article.count({
                where: {
                  labelId: label.id,
                  deleted: false
                }
              });
              labelData.countOfLabel = labelArticleCount;

              labelsWithCount.push(labelData);
            }
            sortData.labels = labelsWithCount;
          } else {
            sortData.labels = [];
          }

          result.push(sortData);
        }

        return result;
      }

      return [];
    } catch (error) {
      console.error('Get sort info data error:', error);
      return [];
    }
  }
}

module.exports = new ArticleService();
