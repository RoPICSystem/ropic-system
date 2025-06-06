"use server";

export interface GitHubCommit {
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

export interface FetchCommitsResult {
  commits: GitHubCommit[];
  totalPages: number;
  error?: string;
}

const GITHUB_REPO = "RoPICSystem/ropic-system";
const GITHUB_API_BASE = "https://api.github.com";

export async function fetchCommits(
  pageNum: number = 1,
  itemsPerPage: number = 10
): Promise<FetchCommitsResult> {
  try {
    const headers: HeadersInit = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'RoPIC-System-App'
    };

    // Add GitHub token if available (server-side environment variable)
    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
    }

    // Fetch commits with pagination
    const response = await fetch(
      `${GITHUB_API_BASE}/repos/${GITHUB_REPO}/commits?page=${pageNum}&per_page=${itemsPerPage}`,
      { 
        headers,
        // Cache for 5 minutes to avoid rate limiting
        next: { revalidate: 300 }
      }
    );

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const commitsData: GitHubCommit[] = await response.json();

    // Fetch detailed stats for first 5 commits to avoid rate limiting
    const commitsWithStats = await Promise.all(
      commitsData.slice(0, 5).map(async (commit) => {
        try {
          const detailResponse = await fetch(
            `${GITHUB_API_BASE}/repos/${GITHUB_REPO}/commits/${commit.sha}`,
            { 
              headers,
              next: { revalidate: 300 }
            }
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

    // Combine detailed commits with basic commits
    const allCommits = [
      ...commitsWithStats,
      ...commitsData.slice(5)
    ];

    // Get total commit count for pagination (approximate)
    let totalPages = 10; // Default estimate
    
    try {
      const repoResponse = await fetch(
        `${GITHUB_API_BASE}/repos/${GITHUB_REPO}`,
        { headers, next: { revalidate: 3600 } } // Cache repo info for 1 hour
      );
      
      if (repoResponse.ok) {
        const repoData = await repoResponse.json();
        // Estimate total pages based on typical commit frequency
        const estimatedCommits = Math.min(repoData.size * 2, 500); // Conservative estimate
        totalPages = Math.ceil(estimatedCommits / itemsPerPage);
      }
    } catch (error) {
      console.error('Error fetching repository info:', error);
    }

    return {
      commits: allCommits,
      totalPages
    };

  } catch (error) {
    console.error("Error fetching commits:", error);
    return {
      commits: [],
      totalPages: 1,
      error: error instanceof Error ? error.message : "Failed to fetch update logs from GitHub"
    };
  }
}

export async function getRepositoryInfo() {
  try {
    const headers: HeadersInit = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'RoPIC-System-App'
    };

    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
    }

    const response = await fetch(
      `${GITHUB_API_BASE}/repos/${GITHUB_REPO}`,
      { 
        headers,
        next: { revalidate: 3600 } // Cache for 1 hour
      }
    );

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const repoData = await response.json();
    
    return {
      name: repoData.name,
      description: repoData.description,
      stargazers_count: repoData.stargazers_count,
      forks_count: repoData.forks_count,
      html_url: repoData.html_url,
      updated_at: repoData.updated_at
    };

  } catch (error) {
    console.error("Error fetching repository info:", error);
    return null;
  }
}