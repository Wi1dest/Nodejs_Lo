const WebInfo = require('../models/WebInfo');
const User = require('../models/User');
const Sort = require('../models/Sort');
const Label = require('../models/Label');
const Article = require('../models/Article');
const TreeHole = require('../models/TreeHole');
const PoetryResult = require('../utils/result');
const PoetryCache = require('../utils/cache');
const constants = require('../utils/constants');
const { Op } = require('sequelize');
const { Sequelize } = require('sequelize');

class WebInfoService {
  // 获取网站信息
  async getWebInfo() {
    try {
      const webInfo = await WebInfo.findOne({ where: { status: true } });
      
      if (!webInfo) {
        return PoetryResult.success(null);
      }
      
      const result = webInfo.toJSON();
      
      // 按照原版逻辑，将这些字段设置为 null
      result.randomAvatar = null;
      result.randomCover = null;
      result.randomName = null;
      result.waifuJson = null;
      
      // 添加历史统计信息
      const sequelize = require('../config/database');
      const totalCount = await sequelize.query(
        'SELECT COUNT(*) as count FROM history_info',
        { type: sequelize.QueryTypes.SELECT }
      );
      result.historyAllCount = (totalCount[0]?.count || 0).toString();
      
      // 查询昨天的记录数
      const now = new Date();
      const utcTime = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
      const beijingTime = new Date(utcTime + (8 * 60 * 60 * 1000));
      const today = new Date(beijingTime.getFullYear(), beijingTime.getMonth(), beijingTime.getDate());
      const todayUTC = new Date(today.getTime() - (8 * 60 * 60 * 1000));
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      const yesterdayUTC = new Date(yesterday.getTime() - (8 * 60 * 60 * 1000));
      
      const todayStr = todayUTC.toISOString().slice(0, 19).replace('T', ' ');
      const yesterdayStr = yesterdayUTC.toISOString().slice(0, 19).replace('T', ' ');
      
      const yesterdayCount = await sequelize.query(
        'SELECT COUNT(DISTINCT ip) as count FROM history_info WHERE create_time >= :yesterdayStr AND create_time < :todayStr',
        {
          replacements: { yesterdayStr, todayStr },
          type: sequelize.QueryTypes.SELECT
        }
      );
      result.historyDayCount = (yesterdayCount[0]?.count || 0).toString();
      
      return PoetryResult.success(result);
    } catch (error) {
      console.error('Get web info error:', error);
      return PoetryResult.fail('查询失败：' + error.message);
    }
  }

  // 更新网站信息
  async updateWebInfo(webInfoVO, req) {
    try {
      const webInfo = await WebInfo.findOne({ where: { status: true } });
      
      if (!webInfo) {
        return PoetryResult.fail('网站信息不存在！');
      }

      const updateData = {};
      if (webInfoVO.webName !== undefined) updateData.webName = webInfoVO.webName;
      if (webInfoVO.webTitle !== undefined) updateData.webTitle = webInfoVO.webTitle;
      if (webInfoVO.notices !== undefined) updateData.notices = webInfoVO.notices;
      if (webInfoVO.footer !== undefined) updateData.footer = webInfoVO.footer;
      if (webInfoVO.backgroundImage !== undefined) updateData.backgroundImage = webInfoVO.backgroundImage;
      if (webInfoVO.avatar !== undefined) updateData.avatar = webInfoVO.avatar;
      if (webInfoVO.randomAvatar !== undefined) updateData.randomAvatar = webInfoVO.randomAvatar;
      if (webInfoVO.randomName !== undefined) updateData.randomName = webInfoVO.randomName;
      if (webInfoVO.randomCover !== undefined) updateData.randomCover = webInfoVO.randomCover;
      if (webInfoVO.waifuJson !== undefined) updateData.waifuJson = webInfoVO.waifuJson;

      await webInfo.update(updateData);
      PoetryCache.remove(constants.WEB_INFO);

      return PoetryResult.success(webInfo.toJSON());
    } catch (error) {
      return PoetryResult.fail('更新失败：' + error.message);
    }
  }

  // 获取分类标签信息
  async getSortInfo() {
    try {
      const result = await this.getSortInfoData();
      return PoetryResult.success(result);
    } catch (error) {
      console.error('Get sort info error:', error);
      return PoetryResult.fail('查询失败：' + error.message);
    }
  }

  // 获取赞赏用户列表
  async getAdmire() {
    try {
      const users = await User.findAll({
        where: {
          admire: {
            [Op.ne]: null
          },
          deleted: false
        },
        attributes: ['id', 'username', 'admire', 'avatar'],
        order: [['create_time', 'DESC']]
      });
      
      const result = users.map(user => user.toJSON());
      
      return PoetryResult.success(result);
    } catch (error) {
      return PoetryResult.fail('查询失败：' + error.message);
    }
  }

  // 保存树洞
  async saveTreeHole(treeHoleVO) {
    try {
      if (!treeHoleVO.message || !treeHoleVO.message.trim()) {
        return PoetryResult.fail('留言不能为空！');
      }

      // 如果没有头像，使用随机头像（暂时留空，需要实现 getRandomAvatar）
      if (!treeHoleVO.avatar || !treeHoleVO.avatar.trim()) {
        // const PoetryUtil = require('../utils/util');
        // treeHoleVO.avatar = PoetryUtil.getRandomAvatar(null);
        treeHoleVO.avatar = null; // 暂时设为null
      }

      const treeHole = await TreeHole.create(treeHoleVO);
      const result = treeHole.toJSON ? treeHole.toJSON() : treeHole;

      return PoetryResult.success(result);
    } catch (error) {
      console.error('Save tree hole error:', error);
      return PoetryResult.fail('保存失败：' + error.message);
    }
  }

  // 删除树洞
  async deleteTreeHole(id) {
    try {
      await TreeHole.destroy({ where: { id: id } });
      return PoetryResult.success();
    } catch (error) {
      return PoetryResult.fail('删除失败：' + error.message);
    }
  }

  // 查询树洞列表
  async listTreeHole() {
    try {
      const count = await TreeHole.count();
      
      let treeHoles;
      if (count > constants.TREE_HOLE_COUNT) {
        // 随机选择起始位置
        const offset = Math.floor(Math.random() * (count + 1 - constants.TREE_HOLE_COUNT));
        treeHoles = await TreeHole.findAll({
          limit: constants.TREE_HOLE_COUNT,
          offset: offset,
          order: [['create_time', 'ASC']]
        });
      } else {
        treeHoles = await TreeHole.findAll({
          order: [['create_time', 'ASC']]
        });
      }

      // 处理树洞数据
      const result = treeHoles.map(treeHole => {
        const data = treeHole.toJSON();
        // 如果没有头像，设置默认头像（这里简化处理，原版使用随机头像）
        if (!data.avatar) {
          data.avatar = 'https://i.ibb.co/5RDrH3S/image.png';
        }
        // 格式化日期
        if (data.createTime || data.create_time) {
          data.createTime = this.formatDateTime(data.createTime || data.create_time);
        }
        return data;
      });

      return PoetryResult.success(result);
    } catch (error) {
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

  // 获取历史信息统计
  async getHistoryInfo() {
    try {
      const sequelize = require('../config/database');
      const User = require('../models/User');
      
      // 查询今天和昨天的历史记录
      const now = new Date();
      const utcTime = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
      const beijingTime = new Date(utcTime + (8 * 60 * 60 * 1000));
      const today = new Date(beijingTime.getFullYear(), beijingTime.getMonth(), beijingTime.getDate());
      const todayUTC = new Date(today.getTime() - (8 * 60 * 60 * 1000));
      
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      const yesterdayUTC = new Date(yesterday.getTime() - (8 * 60 * 60 * 1000));
      
      const todayStr = todayUTC.toISOString().slice(0, 19).replace('T', ' ');
      const yesterdayStr = yesterdayUTC.toISOString().slice(0, 19).replace('T', ' ');
      
      // 查询今天的记录
      const todayResults = await sequelize.query(
        `SELECT id, ip, user_id as userId, nation, province, city 
         FROM history_info 
         WHERE create_time >= :todayStr`,
        {
          replacements: { todayStr },
          type: sequelize.QueryTypes.SELECT
        }
      );
      
      // 查询昨天的记录
      const yesterdayResults = await sequelize.query(
        `SELECT id, ip, user_id as userId, nation, province, city 
         FROM history_info 
         WHERE create_time >= :yesterdayStr AND create_time < :todayStr`,
        {
          replacements: { yesterdayStr, todayStr },
          type: sequelize.QueryTypes.SELECT
        }
      );
      
      // 查询所有历史记录统计
      const allResults = await sequelize.query(
        `SELECT ip, province, nation FROM history_info`,
        { type: sequelize.QueryTypes.SELECT }
      );
      
      const result = {};
      
      // 统计所有历史IP
      const ipMap = new Map();
      for (const item of allResults) {
        if (item.ip) {
          ipMap.set(item.ip, (ipMap.get(item.ip) || 0) + 1);
        }
      }
      result[constants.IP_HISTORY_IP] = Array.from(ipMap.entries())
        .map(([ip, num]) => ({ ip, num }))
        .sort((a, b) => b.num - a.num)
        .slice(0, 10);
      
      // 统计所有历史省份
      const provinceMap = new Map();
      for (const item of allResults) {
        if (item.province) {
          const key = item.province;
          if (!provinceMap.has(key)) {
            provinceMap.set(key, { province: item.province, nation: item.nation, num: 0 });
          }
          provinceMap.get(key).num++;
        }
      }
      result[constants.IP_HISTORY_PROVINCE] = Array.from(provinceMap.values())
        .sort((a, b) => b.num - a.num)
        .slice(0, 10);
      
      // 总访问次数
      result[constants.IP_HISTORY_COUNT] = allResults.length;

      // 昨天的IP统计
      const ipSetYest = new Set(yesterdayResults.map(r => r.ip).filter(Boolean));
      result.ip_count_yest = ipSetYest.size;

      // 批量查询所有用户
      const allUserIds = new Set();
      yesterdayResults.forEach(r => { if (r.userId) allUserIds.add(r.userId); });
      todayResults.forEach(r => { if (r.userId) allUserIds.add(r.userId); });

      const users = allUserIds.size > 0 ? await User.findAll({
        where: { id: Array.from(allUserIds) }
      }) : [];
      const userMap = new Map(users.map(u => {
        const userData = u.toJSON();
        return [u.id, { avatar: userData.avatar || null, username: userData.username || null }];
      }));

      // 昨天的用户
      const userSetYest = new Set(yesterdayResults.map(r => r.userId).filter(Boolean));
      result.username_yest = Array.from(userSetYest).map(id => userMap.get(id)).filter(Boolean);

      // 今天的IP数量
      const ipSetToday = new Set(todayResults.map(r => r.ip).filter(Boolean));
      result.ip_count_today = ipSetToday.size;

      // 今天的用户
      const userSetToday = new Set(todayResults.map(r => r.userId).filter(Boolean));
      result.username_today = Array.from(userSetToday).map(id => userMap.get(id)).filter(Boolean);

      // 今天的省份统计
      const provinceTodayMap = new Map();
      for (const item of todayResults) {
        if (item.province) {
          provinceTodayMap.set(item.province, (provinceTodayMap.get(item.province) || 0) + 1);
        }
      }
      result.province_today = Array.from(provinceTodayMap.entries())
        .map(([province, num]) => ({ province, num }))
        .sort((a, b) => b.num - a.num);

      return PoetryResult.success(result);
    } catch (error) {
      console.error('Get history info error:', error);
      console.error('Error stack:', error.stack);
      return PoetryResult.fail('查询失败：' + error.message);
    }
  }

  // 查询分类和标签列表
  async listSortAndLabel() {
    try {
      const sorts = await Sort.findAll({
        order: [['priority', 'ASC'], ['id', 'ASC']]
      });

      const labels = await Label.findAll({
        order: [['id', 'ASC']]
      });

      // 确保返回的数据结构与原版完全一致，包含 countOfSort 和 labels 字段（即使为 null）
      const result = {
        sorts: sorts.map(s => {
          const sortData = s.toJSON ? s.toJSON() : s;
          // 添加原版实体类中的字段，保持结构一致
          if (sortData.countOfSort === undefined) {
            sortData.countOfSort = null;
          }
          if (sortData.labels === undefined) {
            sortData.labels = null;
          }
          return sortData;
        }),
        labels: labels.map(l => {
          const labelData = l.toJSON ? l.toJSON() : l;
          // Label 实体类中有 countOfLabel 字段（exist = false），但在这个接口中可能不需要
          return labelData;
        })
      };

      return PoetryResult.success(result);
    } catch (error) {
      return PoetryResult.fail('查询失败：' + error.message);
    }
  }

  // 保存分类
  async saveSort(sortVO) {
    try {
      if (!sortVO.sortName || !sortVO.sortName.trim()) {
        return PoetryResult.fail('分类名称和分类描述不能为空！');
      }
      if (!sortVO.sortDescription || !sortVO.sortDescription.trim()) {
        return PoetryResult.fail('分类名称和分类描述不能为空！');
      }

      // SORT_TYPE_BAR = 0, SORT_TYPE_NORMAL = 1
      if (sortVO.sortType === 0 && (sortVO.priority === null || sortVO.priority === undefined)) {
        return PoetryResult.fail('导航栏分类必须配置优先级！');
      }

      await Sort.create(sortVO);

      // 重新获取分类信息并更新缓存
      const sortInfo = await this.getSortInfoData();
      if (sortInfo && sortInfo.length > 0) {
        PoetryCache.put(constants.SORT_INFO, sortInfo, constants.EXPIRE);
      }

      return PoetryResult.success();
    } catch (error) {
      console.error('Save sort error:', error);
      return PoetryResult.fail('保存失败：' + error.message);
    }
  }

  // 删除分类
  async deleteSort(id) {
    try {
      await Sort.destroy({ where: { id: id } });

      // 重新获取分类信息并更新缓存
      const sortInfo = await this.getSortInfoData();
      if (sortInfo && sortInfo.length > 0) {
        PoetryCache.put(constants.SORT_INFO, sortInfo, constants.EXPIRE);
      }

      return PoetryResult.success();
    } catch (error) {
      return PoetryResult.fail('删除失败：' + error.message);
    }
  }

  // 更新分类
  async updateSort(sortVO) {
    try {
      await Sort.update(sortVO, { where: { id: sortVO.id } });

      // 重新获取分类信息并更新缓存
      const sortInfo = await this.getSortInfoData();
      if (sortInfo && sortInfo.length > 0) {
        PoetryCache.put(constants.SORT_INFO, sortInfo, constants.EXPIRE);
      }

      return PoetryResult.success();
    } catch (error) {
      return PoetryResult.fail('更新失败：' + error.message);
    }
  }

  // 查询分类列表
  async listSort() {
    try {
      const sorts = await Sort.findAll({
        order: [['priority', 'ASC'], ['id', 'ASC']]
      });

      return PoetryResult.success(sorts.map(s => s.toJSON ? s.toJSON() : s));
    } catch (error) {
      return PoetryResult.fail('查询失败：' + error.message);
    }
  }

  // 保存标签
  async saveLabel(labelVO) {
    try {
      if (!labelVO.labelName || !labelVO.labelName.trim()) {
        return PoetryResult.fail('标签名称和标签描述和分类Id不能为空！');
      }
      if (!labelVO.labelDescription || !labelVO.labelDescription.trim()) {
        return PoetryResult.fail('标签名称和标签描述和分类Id不能为空！');
      }
      if (labelVO.sortId === null || labelVO.sortId === undefined) {
        return PoetryResult.fail('标签名称和标签描述和分类Id不能为空！');
      }

      await Label.create(labelVO);

      // 重新获取分类信息并更新缓存
      const sortInfo = await this.getSortInfoData();
      if (sortInfo && sortInfo.length > 0) {
        PoetryCache.put(constants.SORT_INFO, sortInfo, constants.EXPIRE);
      }

      return PoetryResult.success();
    } catch (error) {
      console.error('Save label error:', error);
      return PoetryResult.fail('保存失败：' + error.message);
    }
  }

  // 删除标签
  async deleteLabel(id) {
    try {
      await Label.destroy({ where: { id: id } });

      // 重新获取分类信息并更新缓存
      const sortInfo = await this.getSortInfoData();
      if (sortInfo && sortInfo.length > 0) {
        PoetryCache.put(constants.SORT_INFO, sortInfo, constants.EXPIRE);
      }

      return PoetryResult.success();
    } catch (error) {
      return PoetryResult.fail('删除失败：' + error.message);
    }
  }

  // 更新标签
  async updateLabel(labelVO) {
    try {
      await Label.update(labelVO, { where: { id: labelVO.id } });

      // 重新获取分类信息并更新缓存
      const sortInfo = await this.getSortInfoData();
      if (sortInfo && sortInfo.length > 0) {
        PoetryCache.put(constants.SORT_INFO, sortInfo, constants.EXPIRE);
      }

      return PoetryResult.success();
    } catch (error) {
      return PoetryResult.fail('更新失败：' + error.message);
    }
  }

  // 查询标签列表
  async listLabel() {
    try {
      const labels = await Label.findAll({
        order: [['id', 'ASC']]
      });

      return PoetryResult.success(labels.map(l => l.toJSON ? l.toJSON() : l));
    } catch (error) {
      return PoetryResult.fail('查询失败：' + error.message);
    }
  }

  // 获取分类信息数据（内部方法，用于缓存更新）
  async getSortInfoData() {
    try {
      const sorts = await Sort.findAll({
        order: [['priority', 'ASC'], ['id', 'ASC']]
      });

      if (!sorts || sorts.length === 0) return [];

      const sortIds = sorts.map(s => s.id);

      // 批量查询所有标签
      const labels = await Label.findAll({
        where: { sortId: sortIds }
      });

      const labelIds = labels.map(l => l.id);

      // 批量统计文章数
      const [sortCounts, labelCounts] = await Promise.all([
        Article.findAll({
          where: { sortId: sortIds, deleted: false },
          attributes: ['sortId', [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']],
          group: ['sortId'],
          raw: true
        }),
        labelIds.length > 0 ? Article.findAll({
          where: { labelId: labelIds, deleted: false },
          attributes: ['labelId', [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']],
          group: ['labelId'],
          raw: true
        }) : []
      ]);

      // 转换为 Map
      const sortCountMap = new Map(sortCounts.map(s => [s.sortId, parseInt(s.count)]));
      const labelCountMap = new Map(labelCounts.map(l => [l.labelId, parseInt(l.count)]));

      // 按 sortId 分组 labels
      const labelsBySortId = new Map();
      labels.forEach(label => {
        const sortId = label.sortId;
        if (!labelsBySortId.has(sortId)) labelsBySortId.set(sortId, []);
        const labelData = label.toJSON ? label.toJSON() : label;
        labelData.countOfLabel = labelCountMap.get(label.id) || 0;
        labelsBySortId.get(sortId).push(labelData);
      });

      // 组装结果
      return sorts.map(sort => {
        const sortData = sort.toJSON ? sort.toJSON() : sort;
        sortData.countOfSort = sortCountMap.get(sort.id) || 0;
        sortData.labels = labelsBySortId.get(sort.id) || [];
        return sortData;
      });
    } catch (error) {
      console.error('Get sort info data error:', error);
      return [];
    }
  }
}

module.exports = new WebInfoService();
