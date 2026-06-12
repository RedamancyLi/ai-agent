<!-- 服务器固件管理 -->
<template>
    <div class='' v-loading="exportLoading">
        <a-card>
            <div class="search-bar">
                <YwSearchGroup ref="search" :min-width="800" :form-option="searchOpt" @reset="onSubmit" @search="onSubmit">
                    <template slot="operation-right">
                        <a-button class="exportIconBtn" icon="download" @click="openSendMsg(true)" />
                    </template>
                </YwSearchGroup>
            </div>
            <div style="margin-top: 20px;">
                <a-table
                    class="serverTable"
                    bordered
                    :loading="loading"
                    :pagination="false"
                    :columns="columns"
                    :components="componentsColumns"
                    :scroll="{ x: scrollX, y: 500 }"
                    :data-source="dataTable"
                >
                    <template slot="cCode" slot-scope="record">
                        <a-tooltip placement="bottom">
                            <template slot="title">
                                <span>{{ record }}</span>
                            </template>
                            <span style="font-size: 12px;">{{ record }}</span>
                        </a-tooltip>
                    </template>
                    <template slot="cProjectName" slot-scope="record">
                        <a-tooltip placement="bottom">
                            <template slot="title">
                                <span>{{ record }}</span>
                            </template>
                            <span style="font-size: 12px;">{{ record }}</span>
                        </a-tooltip>
                    </template>
                    <template slot="isStableVersion">
                        -
                    </template>
                    <template slot="stableName">
                        -
                    </template>
                    <template slot="action" slot-scope="text, record">
                        <a-button type="link" icon="eye" size="small" @click="viewDetail(record)">查看</a-button>
                    </template>


                </a-table>
            </div>
            <!-- <el-row style="margin-top: 10px;">
                <a-col :span="2" class="pagination-total">共计{{ pagination.total }}条</a-col>
                <a-col :span="22">
                    <a-pagination v-model="pagination.pageNum" :page-size-options="pagination.pageSizeOptions"
                        :total="pagination.total" show-size-changer :page-size="pagination.pageSize"
                        @showSizeChange="onShowSizeChange" @change="onShowPageChange" style="float: right;">
                        <template slot="buildOptionText" slot-scope="props">
                            <span>{{ props.value }}条/页</span>
                        </template>
                    </a-pagination>
                </a-col>
            </el-row> -->
            <div class="pageDiv" style="display: flex; justify-content: flex-end; margin-top: 10px;">
                <a-pagination :current="pagination.pageNum" :page-size-options="pagination.pageSizeOptions"
                    :total="pagination.total" show-size-changer :page-size="pagination.pageSize"
                    :show-total="total => `共 ${total} 项数据`" @change="onShowPageChange" show-quick-jumper
                    @showSizeChange="onShowSizeChange" />
            </div>
        </a-card>
        <sendMsg :open="open" @close="openSendMsg" @finish="handleExport"></sendMsg>
        <a-modal title="历史版本" :visible="visibleDetail" @ok="visibleDetail = false" @cancel="visibleDetail = false">
            <a-table  :loading="loading" :pagination="false" :columns="versionColumns"
                :data-source="versionData">
                <template slot="insertTime" slot-scope="text,record">
                    {{ record.insertTime.replace('T', ' ').replace('Z', '').replace('+08:00', '') }}
                </template>
            </a-table>
        </a-modal>
    </div>
</template>

<script>
//这里可以导入其他文件（比如：组件，工具js，第三方插件js，json文件，图片文件等等）
//例如：import 《组件名称》 from '《组件路径》';
const columns = [
    {
        dataIndex: 'ip',
        key: 'ip',
        title: '设备IP',
        width: 110,
    },
    {
        title: '设备编码',
        dataIndex: 'cCode',
        key: 'cCode',
        ellipsis: true,
        width: 100,
        scopedSlots: { customRender: 'cCode' },
    },
    {
        title: 'SN',
        dataIndex: 'cSn',
        key: 'cSn',
        ellipsis: true,
        width: 100
    },
    {
        title: '厂商',
        dataIndex: 'cVendorName',
        key: 'cVendorName',
        ellipsis: true,
        width: 100
    },
    {
        title: '型号',
        dataIndex: 'cModelName',
        key: 'cModelName',
        ellipsis: true,
        width: 100
    },
    {
        title: '资源池名称',
        dataIndex: 'cPoolName',
        key: 'cPoolName',
        ellipsis: true,
        width: 100
    },
    {
        title: '项目名称',
        dataIndex: 'cProjectName',
        key: 'cProjectName',
        ellipsis: true,
        width: 200,
        scopedSlots: { customRender: 'cProjectName' },
    },

    {
        title: '固件类型',
        dataIndex: 'firmwareType',
        key: 'firmwareType',
        ellipsis: true,
        width: 100
    },
    {
        title: '固件名称',
        dataIndex: 'firmwareName',
        key: 'firmwareName',
        ellipsis: true,
        width: 100
    },
    {
        title: '固件版本',
        dataIndex: 'firmwareVersion',
        key: 'firmwareVersion',
        ellipsis: true,
        width: 100
    },
    {
        title: '部件厂家',
        dataIndex: 'partVendorName',
        key: 'partVendorName',
        ellipsis: true,
        width: 100
    },
    {
        title: '部件型号',
        dataIndex: 'partDeviceType',
        key: 'partDeviceType',
        ellipsis: true,
        width: 100
    },
    {
        title: '是否为隐患',
        dataIndex: 'isStableVersion',
        key: 'isStableVersion',
        scopedSlots: { customRender: 'isStableVersion' },
        ellipsis: true,
        width: 100
    },
    {
        title: '隐患名称',
        dataIndex: 'stableName',
        key: 'stableName',
        scopedSlots: { customRender: 'stableName' },
        ellipsis: true,
        width: 100
    },
    {
        title: '操作',
        dataIndex: 'action',
        key: 'action',
        scopedSlots: { customRender: 'action' },
        width: 80,
        // fixed: 'right',
    },
    // {
    //     title: '操作',
    //     dataIndex: 'age',
    //     key: 'age',
    // },
]
const versionColumns = [
    {
        dataIndex: 'firmwareVersion',
        key: 'firmwareVersion',
        title: '版本',
    },
    {
        dataIndex: 'insertTime',
        key: 'insertTime',
        title: '日期',
        scopedSlots: { customRender: 'insertTime' },
    },
]
import { serverDeviceVersionList, serverDeviceVersionListExport, serverDeviceHistoryVersionList } from './services'
import { getProjectComboBox, getResPoolList } from '@/api/back'
import sendMsg from "@/components/sendMsg-network/index"
import DraggableResizable from '@/mixins/DraggableResizable'
export default {
    mixins: [DraggableResizable],
    //import引入的组件需要注入到对象中才能使用
    components: { sendMsg },
    data() {
        //这里存放数据
        return {
            dataTable: [],
            searchForm: {
                firmwareType: ['bmc'],
            },
            searchOpt: [
                { value: 'ip', label: '设备IP', type: 'input', default: true, config: { allowClear: true } },
                { value: 'cCode', label: '设备编码', type: 'input', config: { allowClear: true } },
                { value: 'poolName', label: '资源池名称', type: 'select', options: [], config: { allowClear: true, showSearch: true } },
                { value: 'projectName', label: '所属项目名', type: 'select', options: [], config: { allowClear: true, showSearch: true } },
                {
                    value: 'state',
                    label: '采集结果',
                    type: 'select',
                    options: [{ label: '成功', value: '1' }, { label: '失败', value: '3' }],
                    config: { allowClear: true }
                },
                { value: 'vendorName', label: '厂家', type: 'input', config: { allowClear: true } },
                { value: 'deviceType', label: '型号', type: 'input', config: { allowClear: true } },
                {
                    value: 'firmwareType',
                    label: '固件类型',
                    type: 'select',
                    required: false,
                    defaultValue: ['bmc'],
                    options: [
                        { label: 'bios', value: 'bios' },
                        { label: 'bmc', value: 'bmc' },
                        { label: 'cpld', value: 'cpld' },
                        { label: 'power', value: 'power' },
                        { label: 'nic', value: 'nic' },
                        { label: 'raid', value: 'raid' },
                        { label: 'disk', value: 'disk' }
                    ],
                    config: { allowClear: true, mode: 'multiple', maxTagCount: 1 }
                },
                { value: 'firmwareName', label: '固件名称', type: 'input', config: { allowClear: true } },
                { value: 'firmwareVersion', label: '固件版本', type: 'input', config: { allowClear: true } },
                { value: 'partVendorName', label: '部件厂家', type: 'input', config: { allowClear: true } },
                { value: 'partDeviceType', label: '部件型号', type: 'input', config: { allowClear: true } },
                {
                    value: 'isStableVersion',
                    label: '是否为隐患版本',
                    type: 'select',
                    options: [{ label: '是', value: '是' }, { label: '否', value: '否' }],
                    config: { allowClear: true }
                },
                { value: 'stableName', label: '隐患名称', type: 'input', config: { allowClear: true } },
            ],
            columns,
            pagination: {
                total: 0,
                size: "large",
                pageNum: 1,
                pageSize: 15,
                showSizeChanger: true,
                pageSizeOptions: ["10", "15", "30", "50", "100"]
            },
            loading: false,
            open: false,
            exportLoading: false,
            visibleDetail: false,
            versionColumns,
            versionData: [],
            _skipNextActivated: false,
        }
    },
    //监听属性 类似于data概念
    computed: {},
    //监控data中的数据变化
    watch: {
        '$route.query': {
            handler() {
                if (this.$route.name !== '服务器自动化-服务器版本管理-设备版本管理') {
                    return
                }
                this.$nextTick(() => this.syncRouteQueryAndLoad(false))
            },
            deep: true,
        },
    },
    //生命周期 - 创建完成（可以访问当前this实例）
    created() {

    },
    //生命周期 - 挂载完成（可以访问DOM元素）
    mounted() {
        this._skipNextActivated = true
        this.initSearchSelectOptions()
        this.syncRouteQueryAndLoad(true)
    },
    beforeRouteUpdate(to, from, next) {
        next()
        if (to.name !== '服务器自动化-服务器版本管理-设备版本管理') {
            return
        }
        this.$nextTick(() => this.syncRouteQueryAndLoad(false))
    },
    activated() {
        if (this._skipNextActivated) {
            this._skipNextActivated = false
            return
        }
        const q = this.$route.query || {}
        if (!(q.vendorName || q.deviceType || q.firmwareType)) {
            return
        }
        this.$nextTick(() => this.syncRouteQueryAndLoad(false))
    },
    //生命周期 - 创建之前
    beforeCreate() {

    },
    //生命周期 - 挂载之前
    beforeMount() {

    },
    //生命周期 - 更新之前
    beforeUpdate() {

    },
    //生命周期 - 更新之后
    updated() {

    },
    //生命周期 - 销毁之前
    beforeDestroy() {

    },
    //生命周期 - 销毁完成
    destroyed() {

    },
    //方法集合
    methods: {
        syncRouteQueryAndLoad(loadDefaultWhenNoQuery) {
            this.$nextTick(() => {
                const searchForm = this.$refs.search && this.$refs.search.searchForm
                if (searchForm && (!searchForm.firmwareType || searchForm.firmwareType.length === 0)) {
                    this.$set(searchForm, 'firmwareType', ['bmc'])
                }
                const applied = this.applyQueryFromRoute()
                if (!applied && loadDefaultWhenNoQuery) {
                    this.getTableData()
                }
            })
        },
        /**
         * 从路由 query 同步「厂家 / 型号 / 固件类型」到搜索栏并拉列表
         * @returns {boolean} 是否已根据 query 拉取列表
         */
        applyQueryFromRoute() {
            const q = this.$route.query || {}
            const hasFilterQuery = !!(q.vendorName || q.deviceType || q.firmwareType)
            if (!hasFilterQuery) {
                return false
            }

            const searchForm = (this.$refs.search && this.$refs.search.searchForm) || this.searchForm

            if (q.vendorName != null && q.vendorName !== '') {
                this.$set(searchForm, 'vendorName', q.vendorName)
                this.$set(this.searchForm, 'vendorName', q.vendorName)
            }
            if (q.deviceType != null && q.deviceType !== '') {
                this.$set(searchForm, 'deviceType', q.deviceType)
                this.$set(this.searchForm, 'deviceType', q.deviceType)
            }
            if (q.firmwareType != null && q.firmwareType !== '') {
                const nextFt = String(q.firmwareType).split(',').filter(Boolean)
                const firmwareType = nextFt.length ? nextFt : ['bmc']
                this.$set(searchForm, 'firmwareType', firmwareType)
                this.$set(this.searchForm, 'firmwareType', firmwareType)
            }

            this.pagination.pageNum = 1
            this.getTableData()
            return true
        },
        getSearchForm() {
            const searchForm = this.$refs.search && this.$refs.search.searchForm ? this.$refs.search.searchForm : {}
            if (!searchForm.firmwareType || searchForm.firmwareType.length === 0) {
                searchForm.firmwareType = ['bmc']
            }
            this.searchForm = { ...this.searchForm, ...searchForm }
            return this.searchForm
        },
        setSearchOptions(field, options) {
            this.searchOpt = this.searchOpt.map(item => {
                if (item.value === field) {
                    return { ...item, options }
                }
                return item
            })
        },
        initSearchSelectOptions() {
            getProjectComboBox().then(res => {
                const { code, data } = res.data
                if (code == '200') {
                    this.setSearchOptions('projectName', (data || []).map(item => ({ label: item.name, value: item.name })))
                }
            })
            getResPoolList({ pageSize: 100000, pageNum: 1 }).then(res => {
                const { code, data } = res.data
                if (code == '200') {
                    this.setSearchOptions('poolName', (data || []).map(item => ({ label: item.name, value: item.name })))
                }
            })
        },
        buildRequestParams() {
            const searchForm = this.getSearchForm()
            return {
                ...searchForm,
                firmwareType: Array.isArray(searchForm.firmwareType) ? searchForm.firmwareType.join(',') : ''
            }
        },
        async viewDetail(e) {
            this.visibleDetail = true
            const resp = await serverDeviceHistoryVersionList({
                firmwareType: e.firmwareType, ip: e.ip,
                // unique: true
            })
            const { data, code, msg } = resp.data

            if (code == 0) {
                console.log(data)
                this.versionData = data.result
            } else {
                this.$message.error(msg)
            }
        },
        openSendMsg(value) {
            this.open = value
        },
        // 导出文件
        async handleExport() {
            this.exportLoading = true;
            this.$message.success('下载文件中请稍后！');
            let params = this.buildRequestParams();

            try {
                const resp = await serverDeviceVersionListExport({
                    pageNum: this.pagination.pageNum,
                    pageSize: this.pagination.pageSize,
                    ...params
                }, {
                    responseType: 'blob' // 确保请求返回 Blob 数据
                });

                // 检查是否是错误响应（后端可能返回 JSON 错误信息，但 responseType 是 blob）
                const isErrorResponse = resp.data.type === 'application/json';

                if (isErrorResponse) {
                    // 如果是 JSON 错误信息，解析并显示错误
                    const errorData = JSON.parse(await resp.data.text());
                    if (errorData.code === 1) {
                        this.$message.error(errorData.msg || '导出失败，请稍后重试');
                        return;
                    }
                } else {
                    // 正常下载文件
                    const contentDisposition = resp.headers['content-disposition'] || '';
                    const fileNameMatch = contentDisposition.match(/filename=(.*)/);
                    const fileName = fileNameMatch
                        ? decodeURIComponent(fileNameMatch[1].replace(/['"]+/g, ''))
                        : '导出文件.zip';

                    const blob = new Blob([resp.data], { type: 'application/zip' });
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = fileName;
                    link.click();
                    URL.revokeObjectURL(link.href);
                }
            } catch (error) {
                // 处理网络错误或接口异常
                this.$message.error('导出失败，请稍后重试');
            } finally {
                this.exportLoading = false;
                // 只有成功下载后才显示成功消息（避免错误时也显示成功）
                if (!isErrorResponse) {
                    this.$message.success('下载成功');
                }
            }
        },
        // 导出文件
        // async handleExport() {
        //     this.exportLoading = true
        //     this.$message.success('下载文件中请稍后！')
        //     let params={
        //        ...this.searchForm,
        //        firmwareType:this.searchForm.firmwareType.join(',')
        //     }
        //     try {
        //         const resp = await serverDeviceVersionListExport({ pageNum: this.pagination.pageNum, pageSize: this.pagination.pageSize, ...params })
        //         const contentDisposition = resp.headers['content-disposition'] || '';
        //         const fileNameMatch = contentDisposition.match(/filename=(.*)/);
        //         const fileName = fileNameMatch ? decodeURIComponent(fileNameMatch[1].replace(/['"]+/g, '')) : '导出文件.zip';
        //         const blob = new Blob([resp.data], { type: 'application/zip' });
        //         const link = document.createElement('a');
        //         link.href = URL.createObjectURL(blob);
        //         link.download = fileName;
        //         link.click();
        //         URL.revokeObjectURL(link.href);
        //     } catch (error) {
        //         this.$message.error('导出失败，请稍后重试')

        //     } finally {
        //         this.exportLoading = false
        //         this.$message.success('下载成功')
        //     }
        // },
        async getTableData() {
            this.loading = true
            let params = this.buildRequestParams()
            const resp = await serverDeviceVersionList({ pageNum: this.pagination.pageNum, pageSize: this.pagination.pageSize, ...params })
            const { code, data, msg } = resp.data
            console.log(resp.data)
            if (code == 0) {
                this.dataTable = data.result
                this.pagination.total = data.total
                this.loading = false
            } else {
                this.$message.error(msg)
                this.loading = false
            }
        },
        onShowPageChange(pageNum, pageSize) {
            this.pagination.pageNum = pageNum;
            this.getTableData()
        },

        onShowSizeChange(pageNum, pageSize) {
            this.pagination.pageNum = 1;
            this.pagination.pageSize = pageSize;
            this.getTableData()
        },
        onSubmit() {
            this.pagination.pageNum = 1
            this.getTableData()
        },
    }
}
</script>
<style lang="less" scoped>
.search-bar {
    display: flex;
    justify-content: flex-end;
    align-items: flex-start;
}

.exportIconBtn {
    width: 32px;
    height: 32px;
    min-width: 32px;
    line-height: 32px;
    padding: 0;
    margin-top: 0;
    vertical-align: top;
}

.uniform-width-form {
    ::v-deep(.ant-input) {
        font-size: 12px !important;
        height: 32px;

    }

    ::v-deep(.ant-select) {
        font-size: 12px !important;
        height: 32px;

    }

    .formBtn {
        ::v-deep(.ant-btn) {
            width: 80px;
            height: 32px;
            opacity: 1;
            gap: 4px;
            border-radius: 3px;

            span {
                font-family: PingFang SC;
                font-weight: 400;
                font-size: 12px;
                line-height: 12px;
                text-align: center;
                vertical-align: middle;

                ::v-deep(.anticon) {
                    font-size: 12px;
                    color: red;
                }

            }
        }
    }
}

.serverTable {
    width: 100%;
    height: calc(100% - 255px);

    ::v-deep(.ant-table-thead>tr>th, .ant-table-tbody>tr>td) {
        height: 32px;
        padding: 0 16px;
    }

    ::v-deep(.ant-table-tbody>tr>td) {
        height: 32px !important;
        padding: 0 16px !important;
    }

    ::v-deep(.ant-table-column-title) {
        font-family: PingFang SC !important;
        font-weight: 500 !important;
        font-size: 12px !important;
        line-height: 18px;

    }

    ::v-deep(.ant-table-row) {
        font-family: PingFang SC !important;
        font-weight: 400 !important;
        font-size: 12px !important;
        line-height: 20px;

    }
}

.pageDiv {
    height: 56px;
    width: 100%;

    ::v-deep(.ant-pagination) {
        font-family: PingFang SC;
        font-weight: 400;
        font-size: 12px;
        line-height: 20px;
        vertical-align: middle;

    }
}

.versionHistoryTable {
    ::v-deep(.ant-table-thead>tr>th, .ant-table-tbody>tr>td) {
        height: 32px;
        padding: 0 16px;
        font-family: PingFang SC !important;
        font-weight: 400 !important;
        font-size: 12px !important;
        line-height: 20px;
    }

    ::v-deep(.ant-table-tbody>tr>td) {
        height: 32px !important;
        padding: 0 16px !important;
        font-family: PingFang SC !important;
        font-weight: 400 !important;
        font-size: 12px !important;
        line-height: 20px;
    }

    ::v-deep(.resize-table-th) {
        font-family: PingFang SC !important;
        font-weight: 500 !important;
        font-size: 12px !important;
        line-height: 18px;

    }

    ::v-deep(.ant-table-row-cell-break-word) {
        font-family: PingFang SC !important;
        font-weight: 400 !important;
        font-size: 12px !important;
        line-height: 20px;

    }
}

/deep/ .table-draggable-handle {
    height: 100% !important;
    left: auto !important;
    right: -5px;
    cursor: col-resize;
    touch-action: none;
    border: none;
    position: absolute;
    transform: none !important;
    bottom: 0;
}

/deep/ .resize-table-th {
    position: relative;
}
</style>
