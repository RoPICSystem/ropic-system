"use client";

import CardList from "@/components/card-list";
import { motionTransition } from '@/utils/anim';
import {
  Button,
  Card,
  CardBody,
  Chip,
  Input,
  Pagination,
  Skeleton,
  Spinner,
  Tab,
  Tabs
} from "@heroui/react";
import { Icon } from "@iconify-icon/react";
import { formatDistanceToNow } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

// GitHub commit interface
interface GitHubCommit {
  sha: string;
  commit: {
    author: {
      name: string;
      email: string;
      date: string;
    };
    message: string;
    url: string;
  };
  author: {
    login: string;
    avatar_url: string;
    html_url: string;
  } | null;
  html_url: string;
  stats?: {
    additions: number;
    deletions: number;
    total: number;
  };
  files?: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
  }>;
}

export default function UpdateLogsPage() {
  // State management
  const [loading, setLoading] = useState(true);
  const [commits, setCommits] = useState<GitHubCommit[]>([]);
  const [filteredCommits, setFilteredCommits] = useState<GitHubCommit[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Filter and pagination state
  const [selectedTab, setSelectedTab] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [searchQuery, setSearchQuery] = useState("");
  const [totalPages, setTotalPages] = useState(1);

  // GitHub repository details
  const GITHUB_REPO = "RoPICSystem/ropic-system";
  const GITHUB_API_BASE = "https://api.github.com";

  // Fetch commits from GitHub API
  const fetchCommits = async (pageNum: number = 1) => {
    try {
      setLoading(true);

      const headers: HeadersInit = {
        'Accept': 'application/vnd.github.v3+json',
      };

      // Add token if available (for higher rate limits)
      if (process.env.GITHUB_TOKEN) {
        headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
      }

      // Fetch commits with pagination
      const response = await fetch(
        `${GITHUB_API_BASE}/repos/${GITHUB_REPO}/commits?page=${pageNum}&per_page=${itemsPerPage}`,
        { headers }
      );

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const commitsData: GitHubCommit[] = await response.json();

      // Fetch detailed stats for each commit (limited to avoid rate limiting)
      const commitsWithStats = await Promise.all(
        commitsData.slice(0, 5).map(async (commit) => {
          try {
            const detailResponse = await fetch(
              `${GITHUB_API_BASE}/repos/${GITHUB_REPO}/commits/${commit.sha}`
            );
            if (detailResponse.ok) {
              const detailData = await detailResponse.json();
              return {
                ...commit,
                stats: detailData.stats,
                files: detailData.files
              };
            }
          } catch (error) {
            console.error(`Error fetching details for commit ${commit.sha}:`, error);
          }
          return commit;
        })
      );

      // For remaining commits, just use basic data
      const allCommits = [
        ...commitsWithStats,
        ...commitsData.slice(5)
      ];

      setCommits(allCommits);
      applyFilters(allCommits);

      // Calculate total pages (GitHub API doesn't provide total count easily)
      // We'll estimate based on typical repository size
      setTotalPages(Math.ceil(100 / itemsPerPage)); // Estimate 100 commits max for pagination

    } catch (error) {
      console.error("Error fetching commits:", error);
      setError("Failed to fetch update logs from GitHub");
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchCommits(page);
  }, [page]);

  // Apply filters when search changes
  useEffect(() => {
    applyFilters(commits);
  }, [searchQuery, selectedTab, commits]);

  const applyFilters = (allCommits: GitHubCommit[]) => {
    let filtered = [...allCommits];

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(commit =>
        commit.commit.message.toLowerCase().includes(query) ||
        commit.commit.author.name.toLowerCase().includes(query) ||
        (commit.author?.login.toLowerCase().includes(query))
      );
    }

    // Apply tab filter
    if (selectedTab !== "all") {
      filtered = filtered.filter(commit => {
        const message = commit.commit.message.toLowerCase();
        switch (selectedTab) {
          case "features":
            return message.includes("feat") || message.includes("add") || message.includes("new");
          case "fixes":
            return message.includes("fix") || message.includes("bug") || message.includes("resolve");
          case "improvements":
            return message.includes("improve") || message.includes("update") || message.includes("enhance");
          case "docs":
            return message.includes("doc") || message.includes("readme") || message.includes("comment");
          default:
            return true;
        }
      });
    }

    setFilteredCommits(filtered);
  };

  const getCommitIcon = (message: string) => {
    const msg = message.toLowerCase();
    if (msg.includes("feat") || msg.includes("add") || msg.includes("new")) {
      return "mdi:plus-circle";
    } else if (msg.includes("fix") || msg.includes("bug")) {
      return "mdi:bug-check";
    } else if (msg.includes("improve") || msg.includes("update") || msg.includes("enhance")) {
      return "mdi:trending-up";
    } else if (msg.includes("doc") || msg.includes("readme")) {
      return "mdi:file-document-edit";
    } else if (msg.includes("refactor")) {
      return "mdi:code-braces";
    } else if (msg.includes("style") || msg.includes("format")) {
      return "mdi:palette";
    } else if (msg.includes("test")) {
      return "mdi:test-tube";
    }
    return "mdi:source-commit";
  };

  const getCommitColor = (message: string) => {
    const msg = message.toLowerCase();
    if (msg.includes("feat") || msg.includes("add") || msg.includes("new")) {
      return "success";
    } else if (msg.includes("fix") || msg.includes("bug")) {
      return "danger";
    } else if (msg.includes("improve") || msg.includes("update") || msg.includes("enhance")) {
      return "primary";
    } else if (msg.includes("doc") || msg.includes("readme")) {
      return "secondary";
    }
    return "default";
  };

  const getCommitType = (message: string) => {
    const msg = message.toLowerCase();
    if (msg.includes("feat") || msg.includes("add") || msg.includes("new")) {
      return "Feature";
    } else if (msg.includes("fix") || msg.includes("bug")) {
      return "Bug Fix";
    } else if (msg.includes("improve") || msg.includes("update") || msg.includes("enhance")) {
      return "Improvement";
    } else if (msg.includes("doc") || msg.includes("readme")) {
      return "Documentation";
    } else if (msg.includes("refactor")) {
      return "Refactor";
    } else if (msg.includes("style") || msg.includes("format")) {
      return "Style";
    } else if (msg.includes("test")) {
      return "Test";
    }
    return "Update";
  };

  const refreshLogs = () => {
    setPage(1);
    fetchCommits(1);
  };

  if (error) {
    return (
      <motion.div {...motionTransition}>
        <div className="container mx-auto p-2 max-w-5xl">
          <div className="flex flex-col items-center justify-center h-[400px]">
            <Icon icon="mdi:alert-circle" className="text-5xl text-danger-500" />
            <h2 className="text-xl font-semibold mt-4">Error Loading Update Logs</h2>
            <p className="text-default-500 mt-2">{error}</p>
            <Button color="primary" onPress={refreshLogs} className="mt-4">
              Try Again
            </Button>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div {...motionTransition}>
      <div className="container mx-auto p-2 max-w-5xl">
        <div className="flex justify-between items-center mb-6 flex-col xl:flex-row w-full">
          <div className="flex flex-col w-full xl:text-left text-center">
            <h1 className="text-2xl font-bold">Update Logs</h1>
            {loading ? (
              <div className="text-default-500 flex xl:justify-start justify-center items-center">
                <p className='my-auto mr-1'>Loading update logs</p>
                <Spinner className="inline-block scale-75 translate-y-[0.125rem]" size="sm" variant="dots" color="default" />
              </div>
            ) : (
              <p className="text-default-500">Recent changes and updates to the system</p>
            )}
          </div>
          <div className="flex gap-4 xl:mt-0 mt-4">
            <Button
              color="primary"
              variant="shadow"
              onPress={refreshLogs}
              isDisabled={loading}
            >
              <Icon icon="mdi:refresh" className="mr-2" />
              Refresh
            </Button>
            <Button
              color="secondary"
              variant="shadow"
              onPress={() => window.open(`https://github.com/${GITHUB_REPO}`, '_blank')}
            >
              <Icon icon="mdi:github" className="mr-2" />
              View on GitHub
            </Button>
          </div>
        </div>

        <CardList className="bg-background flex flex-col">
          <div>
            {/* Fixed header */}
            <div className="sticky -top-4 z-20 w-full bg-background/80 border-b border-default-200 backdrop-blur-lg shadow-sm rounded-t-2xl p-4">
              <div className="flex flex-col xl:flex-row justify-between gap-4">
                <Input
                  placeholder="Search commits..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  startContent={<Icon icon="mdi:magnify" />}
                  isClearable
                  onClear={() => setSearchQuery("")}
                  className="xl:max-w-xs"
                />

                <Tabs
                  selectedKey={selectedTab}
                  onSelectionChange={key => setSelectedTab(key as string)}
                  color="primary"
                  variant="underlined"
                  classNames={{
                    tabList: "gap-4",
                    cursor: "bg-primary",
                  }}
                >
                  <Tab key="all" title="All" />
                  <Tab key="features" title="Features" />
                  <Tab key="fixes" title="Bug Fixes" />
                  <Tab key="improvements" title="Improvements" />
                  <Tab key="docs" title="Documentation" />
                </Tabs>
              </div>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-4 overflow-hidden">

                <AnimatePresence>
                  {loading && (
                    <motion.div {...motionTransition}>
                      <div className="space-y-4 h-full relative">
                        {[...Array(10)].map((_, i) => (
                          <Skeleton key={i} className="w-full min-h-28 rounded-xl" />
                        ))}
                        <div className="absolute bottom-0 left-0 right-0 h-full bg-gradient-to-t from-background to-transparent pointer-events-none" />
                        <div className="py-4 flex absolute mt-16 left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]">
                          <Spinner />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {!loading && filteredCommits.length === 0 && (
                    <motion.div {...motionTransition}>
                      <div className="flex flex-col items-center justify-center h-[300px] p-32">
                        <Icon icon="mdi:source-commit-end" className="text-5xl text-default-300" />
                        <p className="mt-4 text-default-500">No commits found</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {!loading && filteredCommits.length > 0 && (
                    <motion.div {...motionTransition}>
                      <div className="space-y-4">
                        {filteredCommits.map((commit) => (
                          <Card
                            key={commit.sha}
                            className="bg-default-50 overflow-hidden hover:bg-default-100 transition-colors"
                          >
                            <CardBody>
                              <div className="flex items-start gap-4">
                                <div className={`p-3 rounded-full h-12 w-12 bg-${getCommitColor(commit.commit.message)}-100 text-${getCommitColor(commit.commit.message)}-500`}>
                                  <Icon
                                    icon={getCommitIcon(commit.commit.message)}
                                    width={24}
                                    height={24}
                                  />
                                </div>

                                <div className="flex-1">
                                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center">
                                    <div className="font-medium text-lg flex items-center gap-2">
                                      {getCommitType(commit.commit.message)}
                                      <Chip
                                        color={getCommitColor(commit.commit.message)}
                                        variant="flat"
                                        size="sm"
                                      >
                                        {commit.sha.substring(0, 7)}
                                      </Chip>
                                    </div>

                                    <div className="flex items-center gap-2 text-sm text-default-500">
                                      <span>{formatDistanceToNow(new Date(commit.commit.author.date), { addSuffix: true })}</span>
                                    </div>
                                  </div>

                                  <p className="mt-1 text-default-700">
                                    {commit.commit.message.split('\n')[0]}
                                  </p>

                                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mt-3 gap-2">
                                    <div className="flex items-center gap-2 text-sm text-default-500">
                                      {/* {commit.author && (
                                        <>
                                          <img
                                            src={commit.author.avatar_url}
                                            alt={commit.author.login}
                                            className="w-6 h-6 rounded-full"
                                          />
                                          <span>{commit.author.login}</span>
                                        </>
                                      )}
                                      {!commit.author && (
                                        <span>{commit.commit.author.name}</span>
                                      )} */}
                                    </div>

                                    {commit.stats && (
                                      <div className="flex items-center gap-4 text-sm">
                                        <div className="flex items-center gap-1 text-success-600">
                                          <Icon icon="mdi:plus" width={16} />
                                          <span>{commit.stats.additions}</span>
                                        </div>
                                        <div className="flex items-center gap-1 text-danger-600">
                                          <Icon icon="mdi:minus" width={16} />
                                          <span>{commit.stats.deletions}</span>
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  <div className="flex justify-end mt-2">
                                    <Button
                                      size="sm"
                                      variant="light"
                                      onPress={() => window.open(commit.html_url, '_blank')}
                                    >
                                      View commit
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </CardBody>
                          </Card>
                        ))}

                        {totalPages > 1 && (
                          <div className="flex justify-center mt-6">
                            <Pagination
                              total={totalPages}
                              initialPage={1}
                              page={page}
                              onChange={setPage}
                              classNames={{
                                cursor: "bg-primary",
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </CardList>
      </div>
    </motion.div>
  );
}